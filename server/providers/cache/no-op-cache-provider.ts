import type { CacheProvider } from './cache-provider'

/**
 * Default cache provider used when no cache binding (e.g. KV) is configured.
 * Reads always miss and writes are dropped, so callers degrade to reading
 * straight from D1. A real adapter is added in the optional cache phase.
 */
export function createNoOpCacheProvider(): CacheProvider {
  return {
    async get() {
      return null
    },
    async set() {},
    async delete() {}
  }
}
