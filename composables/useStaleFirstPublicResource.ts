import {
  computed,
  getCurrentInstance,
  onMounted,
  onScopeDispose,
  toValue,
  watch,
  type MaybeRefOrGetter
} from 'vue'
import { publicErrorStatus } from '~/utils/public-errors'

type QueryValue = string | number | boolean | null | undefined
type PublicResourceQuery = object

const MAX_SESSION_RESPONSES = 100
const sessionResponses = new Map<string, unknown>()
const revalidatingKeys = new Set<string>()

function readSessionResponse<TData>(key: string): TData | undefined {
  if (!sessionResponses.has(key)) return undefined
  const value = sessionResponses.get(key) as TData
  sessionResponses.delete(key)
  sessionResponses.set(key, value)
  return value
}

function rememberSessionResponse(key: string, value: unknown): void {
  sessionResponses.delete(key)
  sessionResponses.set(key, value)
  while (sessionResponses.size > MAX_SESSION_RESPONSES) {
    const oldest = sessionResponses.keys().next().value
    if (typeof oldest !== 'string') break
    sessionResponses.delete(oldest)
  }
}

function forgetSessionResponse(key: string): void {
  sessionResponses.delete(key)
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
}

export function useStaleFirstPublicResource<TData>(
  request: MaybeRefOrGetter<string>,
  options: {
    key: MaybeRefOrGetter<string>
    query?: MaybeRefOrGetter<PublicResourceQuery>
    server?: boolean
  }
) {
  // Dynamic public routes remount by fullPath. Capturing the key here avoids Nuxt copying the
  // preceding reactive-key value into a new slug/page before the new request resolves. Reactive
  // callers are handled by an explicit client watcher below rather than Nuxt's reactive key copy.
  const initialKey = toValue(options.key)
  const currentKey = computed(() => toValue(options.key))
  let servedFromSession = false
  const hydratingAtSetup = import.meta.client && useNuxtApp().isHydrating
  let revalidationController: AbortController | null = null
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
    }
  }

  function shouldRecoverHydratedFailure(error: unknown): boolean {
    const status = publicErrorStatus(error)
    return error != null && (status === null || status >= 500)
  }

  if (import.meta.client && getCurrentInstance()) {
    onMounted(() => {
      if (servedFromSession || (hydratingAtSetup && shouldRecoverHydratedFailure(state.error.value))) {
        void revalidate(initialKey)
      }
    })
    watch(currentKey, (nextKey, previousKey) => {
      if (nextKey === previousKey) return
      const cached = readSessionResponse<TData>(nextKey)
      state.data.value = (cached ?? null) as never
      state.error.value = null
      void revalidate(nextKey)
    })
    onScopeDispose(() => {
      revalidationController?.abort()
      revalidationController = null
    })
  }

  return state
}
