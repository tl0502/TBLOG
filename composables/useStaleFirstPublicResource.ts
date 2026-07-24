import {
  computed,
  getCurrentInstance,
  onMounted,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter
} from 'vue'
import { publicErrorStatus } from '~/utils/public-errors'

type QueryValue = string | number | boolean | null | undefined
type PublicResourceQuery = object

const MAX_SESSION_RESPONSES = 100
/** Skip background revalidation when the session entry is newer than this (ms). */
export const PUBLIC_SESSION_FRESH_MS = 45_000

interface SessionEntry {
  value: unknown
  storedAt: number
}

const sessionResponses = new Map<string, SessionEntry>()
const revalidatingKeys = new Set<string>()
/** Prefetch-only dedupe — must not block mounted revalidate (which updates live UI state). */
const prefetchingKeys = new Set<string>()

function touchSessionEntry(key: string, entry: SessionEntry): void {
  sessionResponses.delete(key)
  sessionResponses.set(key, entry)
}

function readSessionResponse<TData>(key: string): TData | undefined {
  const entry = sessionResponses.get(key)
  if (!entry) return undefined
  touchSessionEntry(key, entry)
  return entry.value as TData
}

function peekSessionEntry(key: string): SessionEntry | undefined {
  return sessionResponses.get(key)
}

function rememberSessionResponse(key: string, value: unknown): void {
  sessionResponses.delete(key)
  sessionResponses.set(key, { value, storedAt: Date.now() })
  while (sessionResponses.size > MAX_SESSION_RESPONSES) {
    const oldest = sessionResponses.keys().next().value
    if (typeof oldest !== 'string') break
    sessionResponses.delete(oldest)
  }
}

function forgetSessionResponse(key: string): void {
  sessionResponses.delete(key)
}

function isSessionFresh(key: string, maxAgeMs = PUBLIC_SESSION_FRESH_MS): boolean {
  const entry = peekSessionEntry(key)
  if (!entry) return false
  return Date.now() - entry.storedAt < maxAgeMs
}

function normalizedQuery(query: PublicResourceQuery): Array<[string, QueryValue]> {
  return Object.entries(query as Record<string, QueryValue>)
    .filter((entry) => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
}

export function publicResourceKey(prefix: string, query: PublicResourceQuery = {}): string {
  const suffix = normalizedQuery(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return suffix ? `public:${prefix}?${suffix}` : `public:${prefix}`
}

export function clearStaleFirstPublicResourceCache(): void {
  sessionResponses.clear()
  revalidatingKeys.clear()
  prefetchingKeys.clear()
}

/**
 * Warm the browser-session cache for a public resource without mounting a component.
 * No-ops when a fresh entry already exists or a prefetch is already in flight.
 * Uses a separate lock from mount revalidation so a warm-up never blocks UI updates.
 */
export async function prefetchStaleFirstPublicResource<TData>(
  request: string,
  options: {
    key: string
    query?: PublicResourceQuery
    /** Override freshness window; default matches mount-time soft revalidation. */
    maxAgeMs?: number
  }
): Promise<void> {
  if (!import.meta.client) return
  const maxAgeMs = options.maxAgeMs ?? PUBLIC_SESSION_FRESH_MS
  if (isSessionFresh(options.key, maxAgeMs)) return
  if (prefetchingKeys.has(options.key) || revalidatingKeys.has(options.key)) return
  prefetchingKeys.add(options.key)
  try {
    const response = await $fetch<TData>(request, { query: options.query })
    rememberSessionResponse(options.key, response)
  } catch {
    // Prefetch is best-effort; misses stay cold until the real navigation.
  } finally {
    prefetchingKeys.delete(options.key)
  }
}

export function useStaleFirstPublicResource<TData>(
  request: MaybeRefOrGetter<string>,
  options: {
    key: MaybeRefOrGetter<string>
    query?: MaybeRefOrGetter<PublicResourceQuery>
    server?: boolean
    /** Soft-revalidate age; set 0 to always revalidate after session serve. */
    freshMs?: number
  }
) {
  // Dynamic public routes remount by fullPath. Capturing the key here avoids Nuxt copying the
  // preceding reactive-key value into a new slug/page before the new request resolves. Reactive
  // callers are handled by an explicit client watcher below rather than Nuxt's reactive key copy.
  const initialKey = toValue(options.key)
  const currentKey = computed(() => toValue(options.key))
  const freshMs = options.freshMs ?? PUBLIC_SESSION_FRESH_MS
  let servedFromSession = false
  const hydratingAtSetup = import.meta.client && useNuxtApp().isHydrating
  let revalidationController: AbortController | null = null
  /** True while a client soft-revalidate is in flight (pagination/sort or mount refresh). */
  const isRevalidating = shallowRef(false)
  // Relative API calls during SSR must retain the current Nitro request context so Cloudflare
  // bindings (notably D1) remain available to the internally dispatched API handler.
  const requestFetch = import.meta.server ? useRequestFetch() : $fetch

  async function fetchResource(signal?: AbortSignal): Promise<TData> {
    const response = await requestFetch(toValue(request), {
      query: options.query ? toValue(options.query) : undefined,
      signal
    }) as TData
    return response
  }

  const state = useAsyncData<TData>(initialKey, async (_nuxtApp, { signal }): Promise<TData> => {
    const response = await fetchResource(signal)
    if (import.meta.client) rememberSessionResponse(initialKey, response)
    return response
  }, {
    server: options.server,
    dedupe: 'defer',
    getCachedData(cacheKey, nuxtApp) {
      const cached = import.meta.client ? readSessionResponse<TData>(cacheKey) : undefined
      if (cached !== undefined) {
        servedFromSession = true
        return cached
      }
      const payload = nuxtApp.isHydrating
        ? nuxtApp.payload.data[cacheKey] as TData | undefined
        : nuxtApp.static.data[cacheKey] as TData | undefined
      if (import.meta.client && payload !== undefined) rememberSessionResponse(cacheKey, payload)
      return payload
    }
  })

  async function revalidate(keyAtStart: string): Promise<void> {
    if (revalidatingKeys.has(keyAtStart)) return
    revalidatingKeys.add(keyAtStart)
    isRevalidating.value = true
    const controller = new AbortController()
    revalidationController?.abort()
    revalidationController = controller
    const stale = state.data.value
    try {
      const fresh = await fetchResource(controller.signal)
      if (currentKey.value !== keyAtStart) return
      rememberSessionResponse(keyAtStart, fresh)
      state.data.value = fresh as never
      state.error.value = null
    } catch (cause) {
      if (controller.signal.aborted) return
      if (currentKey.value !== keyAtStart) return
      const status = publicErrorStatus(cause)
      if (status === 404 || status === 410) {
        // A not-found/gone response is authoritative lifecycle state, not a temporary outage.
        // Never keep withdrawn public content visible from the browser-session cache.
        forgetSessionResponse(keyAtStart)
        state.data.value = null as never
        state.error.value = cause as never
        return
      }
      // A failed background request is a decoration error; never replace stale content with empty data.
      state.data.value = (stale ?? null) as never
      state.error.value = cause as never
    } finally {
      if (revalidationController === controller) revalidationController = null
      revalidatingKeys.delete(keyAtStart)
      // Only clear when this call still owns the flag path (another revalidate may have started).
      if (!revalidatingKeys.size) isRevalidating.value = false
    }
  }

  function shouldRecoverHydratedFailure(error: unknown): boolean {
    const status = publicErrorStatus(error)
    return error != null && (status === null || status >= 500)
  }

  if (import.meta.client && getCurrentInstance()) {
    onMounted(() => {
      if (hydratingAtSetup && shouldRecoverHydratedFailure(state.error.value)) {
        void revalidate(initialKey)
        return
      }
      // Soft revalidation: skip network when session data is still fresh (e.g. post → home).
      if (servedFromSession && !isSessionFresh(initialKey, freshMs)) {
        void revalidate(initialKey)
      }
    })
    watch(currentKey, (nextKey, previousKey) => {
      if (nextKey === previousKey) return
      const cached = readSessionResponse<TData>(nextKey)
      if (cached !== undefined) {
        state.data.value = cached as never
        state.error.value = null
        if (isSessionFresh(nextKey, freshMs)) return
        void revalidate(nextKey)
        return
      }
      // No cache for the next key: keep the previous payload visible (stale-while-revalidate)
      // so pagination/sort swaps do not flash an empty list while the next page loads.
      state.error.value = null
      void revalidate(nextKey)
    })
    onScopeDispose(() => {
      revalidationController?.abort()
      revalidationController = null
    })
  }

  return {
    ...state,
    isRevalidating
  }
}
