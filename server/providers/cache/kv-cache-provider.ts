import type { CacheProvider } from './cache-provider'

/** Minimal structural view of a Cloudflare Workers KV namespace — only the methods this adapter uses. */
export interface KvNamespaceLike {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface KvCacheProviderOptions {
  kv: KvNamespaceLike
  /** Prepended to every key so one namespace can be shared without collisions. */
  keyPrefix?: string
  /** Applied to writes that do not pass an explicit TTL. Omitted when unset (entries persist until invalidated). */
  defaultTtlSeconds?: number
  /** Called after a failed delete so the factory can persist a best-effort generation fallback. */
  onDeleteFailure?: (error: unknown) => void | Promise<void>
}

// Cloudflare KV rejects an expirationTtl below 60 seconds; clamp up so a small configured TTL still writes.
const MIN_KV_TTL_SECONDS = 60
const SAME_KEY_WRITE_WINDOW_MS = 1_000

interface KvWriteState {
  inFlight: Map<string, { signature: string; promise: Promise<void> }>
  recent: Map<string, { signature: string; writtenAt: number }>
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * `CacheProvider` backed by a Workers KV namespace. Values are JSON-encoded. Every operation is
 * guarded: a KV fault degrades to a miss (get) or a dropped write (set/delete) and is logged, never
 * thrown, so a cache problem can never break a public read or an admin write. Callers still read
 * through to D1 on a miss, so this only ever accelerates reads — it is never the source of truth.
 */
export function createKvCacheProvider(options: KvCacheProviderOptions): CacheProvider {
  const { kv } = options
  const prefix = options.keyPrefix ?? ''
  const defaultTtl = options.defaultTtlSeconds
  // Request-scoped provider instances may coalesce duplicate fills safely. Cross-request/isolate
  // contention is still handled by the adapter's existing best-effort 429 degradation.
  const writeState: KvWriteState = { inFlight: new Map(), recent: new Map() }

  function prefixed(key: string): string {
    return prefix ? `${prefix}${key}` : key
  }

  function resolveTtl(ttlSeconds?: number): number | undefined {
    const ttl = ttlSeconds ?? defaultTtl
    if (ttl === undefined || ttl <= 0) {
      return undefined
    }
    return Math.max(ttl, MIN_KV_TTL_SECONDS)
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const raw = await kv.get(prefixed(key), 'text')
        return raw === null ? null : (JSON.parse(raw) as T)
      } catch (error) {
        console.error(`[kv-cache] get failed for ${key}`, error)
        return null
      }
    },
    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      const fullKey = prefixed(key)
      try {
        const ttl = resolveTtl(ttlSeconds)
        const serialized = JSON.stringify(value)
        const signature = `${ttl ?? ''}:${serialized}`
        const inFlight = writeState.inFlight.get(fullKey)
        if (inFlight?.signature === signature) {
          await inFlight.promise
          return
        }

        const now = Date.now()
        const recent = writeState.recent.get(fullKey)
        if (
          recent?.signature === signature
          && now - recent.writtenAt < SAME_KEY_WRITE_WINDOW_MS
        ) {
          return
        }

        const write = (async () => {
          // Preserve latest-wins ordering for different values written by the same request-scoped
          // provider. Wait for the preceding write and KV's one-write-per-key window instead of
          // issuing concurrent puts whose completion order is undefined.
          await inFlight?.promise.catch(() => {})
          const latest = writeState.recent.get(fullKey)
          if (latest) {
            const waitMs = SAME_KEY_WRITE_WINDOW_MS - (Date.now() - latest.writtenAt)
            if (waitMs > 0) await delay(waitMs)
          }
          await kv.put(fullKey, serialized, ttl ? { expirationTtl: ttl } : undefined)
          writeState.recent.set(fullKey, { signature, writtenAt: Date.now() })
        })()
        const trackedWrite = { signature, promise: write }
        writeState.inFlight.set(fullKey, trackedWrite)
        try {
          await write
        } finally {
          if (writeState.inFlight.get(fullKey) === trackedWrite) {
            writeState.inFlight.delete(fullKey)
          }
        }
      } catch (error) {
        console.error(`[kv-cache] set failed for ${key}`, error)
      }
    },
    async delete(keys: string[]): Promise<void> {
      try {
        await Promise.all(keys.map((key) => kv.delete(prefixed(key))))
      } catch (error) {
        console.error(`[kv-cache] delete failed for ${keys.join(', ')}`, error)
        try {
          await options.onDeleteFailure?.(error)
        } catch (fallbackError) {
          console.error('[kv-cache] delete fallback failed', fallbackError)
        }
      }
    }
  }
}
