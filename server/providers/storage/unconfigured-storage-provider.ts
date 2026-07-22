import type { StorageProvider } from './storage-provider'

/**
 * Placeholder used when no storage provider is configured (no R2 binding, or the capability is
 * disabled). Reads report "absent" and mutating operations throw, so a caller that reaches this
 * without first gating on availability fails loudly instead of silently dropping an upload. Callers
 * keep external image URL insertion as the default media model and only invoke a real provider when
 * storage is available.
 */
export function createUnconfiguredStorageProvider(): StorageProvider {
  function unavailable(): never {
    throw new Error('Storage is not configured')
  }
  return {
    async put() {
      return unavailable()
    },
    async head() {
      return null
    },
    async delete() {},
    publicUrl() {
      return unavailable()
    }
  }
}
