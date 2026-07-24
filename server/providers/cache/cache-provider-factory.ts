import type { H3Event } from 'h3'
import { getDatabaseClient } from '../../database/client'
import { createIntegrationSettingsRepository } from '../../repositories/integration-settings-repository'
import {
  CACHE_KV_BINDING,
  CLOUDFLARE_KV_CACHE_PROVIDER_KEY,
  cloudflareKvCacheRegistration,
  isKvNamespaceBinding
} from '../../integrations/providers/cloudflare-kv-cache'
import type { CacheDeleteOptions, CacheProvider } from './cache-provider'
import { createKvCacheProvider, type KvNamespaceLike } from './kv-cache-provider'
import { createNoOpCacheProvider } from './no-op-cache-provider'

interface KvCacheConfig {
  keyPrefix?: string
  ttlSeconds?: number
}

/**
 * Default expiry when the administrator leaves TTL blank. Bounds orphaned generations after
 * rotation and limits how long a failed invalidation can serve stale public projections.
 * Operators who need longer retention can set `ttlSeconds` explicitly (up to 30 days).
 */
export const CACHE_GENERATION_SAFETY_TTL_SECONDS = 3_600
/** Bump when a deployment changes a cached public projection incompatibly. */
export const CACHE_SCHEMA_VERSION = 1
/** Keep one invalidation comfortably below KV's invocation and Free-plan daily delete budgets. */
export const CACHE_RESOURCE_DELETE_LIMIT = 50
/** Reserve headroom below KV's 1,000-operation invocation limit if generation rotation fails. */
export const CACHE_ROTATION_FAILURE_DELETE_LIMIT = 900

/**
 * Resolve KV cache options from public config + the `CACHE_KV` binding, or `null` when the binding is
 * absent. Single source of truth for "is the cache actually usable". The binding is only ever read from
 * `env` (Cloudflare), never from persisted config.
 */
export function resolveKvCacheOptions(
  config: KvCacheConfig,
  env: Record<string, unknown>
): { kv: KvNamespaceLike; keyPrefix: string; defaultTtlSeconds?: number } | null {
  const binding = env[CACHE_KV_BINDING]
  if (!isKvNamespaceBinding(binding)) {
    return null
  }
  return {
    kv: binding,
    keyPrefix: typeof config.keyPrefix === 'string' ? config.keyPrefix : '',
    defaultTtlSeconds: typeof config.ttlSeconds === 'number' ? config.ttlSeconds : undefined
  }
}

/**
 * Resolve the active `CacheProvider` for a request. Returns the KV-backed provider only when the
 * `CACHE_KV` binding is present AND the `cache` integration row is enabled and complete; anything
 * missing degrades to the no-op so public reads fall back to D1. Resolution is lazy and memoized: the
 * no-binding fast path returns before any database read, so a deployment without KV pays nothing.
 */
export function createCacheProviderForEvent(event: H3Event): CacheProvider {
  const env = event.context.cloudflare?.env ?? {}
  let resolved: Promise<{ cache: CacheProvider; active: boolean }> | null = null

  async function rotateGenerationBestEffort(reason: string): Promise<boolean> {
    try {
      const repository = createIntegrationSettingsRepository(getDatabaseClient(event))
      await repository.touch('cache', CLOUDFLARE_KV_CACHE_PROVIDER_KEY, new Date())
      return true
    } catch (error) {
      console.error(`[cache-provider] ${reason}; generation fallback failed`, error)
      return false
    }
  }

  async function resolve(): Promise<{ cache: CacheProvider; active: boolean }> {
    // Fast path: without the binding there is nothing to resolve, so skip the integration lookup and
    // keep the baseline (no-KV) deployment query-free on public reads.
    if (!isKvNamespaceBinding(env[CACHE_KV_BINDING])) {
      return { cache: createNoOpCacheProvider(), active: false }
    }

    try {
      const db = getDatabaseClient(event)
      const record = await createIntegrationSettingsRepository(db).findByCapabilityAndProvider(
        'cache',
        CLOUDFLARE_KV_CACHE_PROVIDER_KEY
      )
      if (!record?.enabled) {
        return { cache: createNoOpCacheProvider(), active: false }
      }

      let storedConfig: unknown = {}
      try {
        storedConfig = record.publicConfigJson ? JSON.parse(record.publicConfigJson) : {}
      } catch {
        return { cache: createNoOpCacheProvider(), active: false }
      }
      const parsedConfig = cloudflareKvCacheRegistration.configSchema.safeParse(storedConfig)
      if (!parsedConfig.success) {
        return { cache: createNoOpCacheProvider(), active: false }
      }
      const config = parsedConfig.data as KvCacheConfig

      const options = resolveKvCacheOptions(config, env)
      if (!options) {
        return { cache: createNoOpCacheProvider(), active: false }
      }
      return {
        active: true,
        cache: createKvCacheProvider({
          kv: options.kv,
          // Integration configuration changes intentionally rotate the namespace. Ordinary
          // resource invalidation deletes only the requested keys from this generation.
          keyPrefix: `${options.keyPrefix}v:${CACHE_SCHEMA_VERSION}:g:${record.updatedAt.getTime()}:`,
          defaultTtlSeconds: options.defaultTtlSeconds ?? CACHE_GENERATION_SAFETY_TTL_SECONDS,
          onDeleteFailure: async () => {
            await rotateGenerationBestEffort('KV resource deletion failed')
          }
        })
      }
    } catch (error) {
      console.error('[cache-provider] failed to resolve configured KV cache', error)
      return { cache: createNoOpCacheProvider(), active: false }
    }
  }

  function provider(): Promise<{ cache: CacheProvider; active: boolean }> {
    return (resolved ??= resolve())
  }

  const facade: CacheProvider = {
    async get<T>(key: string): Promise<T | null> {
      return (await provider()).cache.get<T>(key)
    },
    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      await (await provider()).cache.set<T>(key, value, ttlSeconds)
    },
    async delete(keys: string[], options?: CacheDeleteOptions): Promise<void> {
      try {
        const uniqueKeys = [...new Set(keys)]
        let keysToDelete = uniqueKeys

        // Generation rotation does not need resource keys (used by purge and strong withdrawals).
        if (options?.forceGeneration) {
          if (await rotateGenerationBestEffort('strong cache withdrawal requested')) return
          // Preserve the previous best-effort behavior when D1 is unavailable: exact deletion is
          // still eventually consistent, but is better than abandoning the withdrawal entirely.
        }
        if (uniqueKeys.length === 0) return
        if (!options?.forceGeneration && uniqueKeys.length > CACHE_RESOURCE_DELETE_LIMIT) {
          if (await rotateGenerationBestEffort(
            `resource invalidation exceeded ${CACHE_RESOURCE_DELETE_LIMIT} keys`
          )) return
          // A failed D1 generation write must not abandon invalidation entirely. Delete a bounded
          // set from the current generation while reserving headroom below KV's invocation limit.
          keysToDelete = uniqueKeys.slice(0, CACHE_ROTATION_FAILURE_DELETE_LIMIT)
          if (keysToDelete.length < uniqueKeys.length) {
            console.error(
              `[cache-provider] generation rotation failed; exact fallback limited to ${keysToDelete.length} of ${uniqueKeys.length} keys`
            )
          }
        }

        const current = await provider()
        if (current.active) {
          await current.cache.delete(keysToDelete)
          return
        }
        // Without a usable KV namespace, rotate the integration generation best-effort so stale
        // entries cannot reappear when the binding/provider recovers. This path never fails a
        // completed core write, and all generated entries have a bounded safety TTL.
        await rotateGenerationBestEffort('cache unavailable during resource invalidation')
      } catch (error) {
        // Cache invalidation is an optional side effect. Never turn a successful core D1 write into
        // an API failure or prevent later provider/search side effects from running.
        console.error('[cache-provider] resource invalidation failed', error)
      }
    }
  }
  return facade
}
