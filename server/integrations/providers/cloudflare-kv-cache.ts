import { z } from 'zod'
import type { KvNamespaceLike } from '../../providers/cache/kv-cache-provider'
import type { ProviderRegistration } from '../registry'

export const CLOUDFLARE_KV_CACHE_PROVIDER_KEY = 'cloudflare-kv'
export const CACHE_KV_BINDING = 'CACHE_KV'

/** Keep registry readiness and runtime provider resolution on the same binding contract. */
export function isKvNamespaceBinding(binding: unknown): binding is KvNamespaceLike {
  return Boolean(
    binding &&
    typeof (binding as KvNamespaceLike).get === 'function' &&
    typeof (binding as KvNamespaceLike).put === 'function' &&
    typeof (binding as KvNamespaceLike).delete === 'function'
  )
}

const configSchema = z
  .object({
    keyPrefix: z.string().trim().max(64).optional(),
    ttlSeconds: z.coerce.number().int().min(60).max(2_592_000).optional()
  })
  .strip()

/**
 * Cloudflare KV cache. Backs the read-through public cache with a KV namespace bound as `CACHE_KV`.
 * All config is public (key prefix, default TTL) and there is no secret. When the binding is absent the
 * capability stays disabled and public reads fall back to D1.
 */
export const cloudflareKvCacheRegistration: ProviderRegistration = {
  capability: 'cache',
  providerKey: CLOUDFLARE_KV_CACHE_PROVIDER_KEY,
  displayName: 'Cloudflare KV Cache',
  configSchema,
  validate() {
    return null
  },
  checkStatus(_config, env) {
    if (!isKvNamespaceBinding(env[CACHE_KV_BINDING])) {
      return { status: 'unavailable', error: `Missing or invalid ${CACHE_KV_BINDING} binding` }
    }
    return { status: 'active' }
  },
  publicProjection(config) {
    return {
      keyPrefix: (config.keyPrefix as string | undefined) ?? null,
      ttlSeconds: (config.ttlSeconds as number | undefined) ?? null
    }
  },
  requiredSecrets: [],
  requiredBindings: [CACHE_KV_BINDING],
  formMeta: [
    {
      key: 'keyPrefix',
      label: 'Key prefix',
      type: 'text',
      placeholder: 'tblog:',
      help: 'Optional prefix applied to every cache key so one namespace can be shared safely.',
      required: false
    },
    {
      key: 'ttlSeconds',
      label: 'Default TTL (seconds)',
      type: 'text',
      placeholder: '3600',
      help: 'Optional default expiry for cached entries (minimum 60). Blank uses a 1-hour safety expiry.',
      required: false
    }
  ],
  actions: [
    { key: 'test', label: 'Check configuration and binding' },
    { key: 'purge', label: 'Purge cache (rotate generation)' }
  ]
}
