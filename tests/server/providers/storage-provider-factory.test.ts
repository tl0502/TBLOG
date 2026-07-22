import { describe, expect, it } from 'vitest'
import {
  createStorageProvider,
  resolveR2StorageOptions
} from '../../../server/providers/storage/storage-provider-factory'
import type { R2BucketLike, R2ObjectLike } from '../../../server/providers/storage/r2-storage-provider'

function fakeBucket(): R2BucketLike {
  return {
    async put(key): Promise<R2ObjectLike> {
      return { key, size: 0 }
    },
    async head() {
      return null
    },
    async delete() {}
  }
}

const config = { publicBaseUrl: 'https://media.example.com', keyPrefix: 'uploads/' }

describe('storage provider factory readiness gating', () => {
  it('returns null options when the R2 binding is absent', () => {
    expect(resolveR2StorageOptions(config, {})).toBeNull()
  })

  it('returns null options when the public base URL is missing', () => {
    expect(resolveR2StorageOptions({}, { MEDIA_R2: fakeBucket() })).toBeNull()
  })

  it.each([
    { publicBaseUrl: 'https://media.example.com?token=x' },
    { publicBaseUrl: 'https://media.example.com', keyPrefix: '../private/' },
    { publicBaseUrl: 123 }
  ])('returns null options for invalid persisted config %#', (invalidConfig) => {
    expect(resolveR2StorageOptions(invalidConfig, { MEDIA_R2: fakeBucket() })).toBeNull()
  })

  it('resolves options when both the binding and public base URL are present', () => {
    const options = resolveR2StorageOptions(config, { MEDIA_R2: fakeBucket() })

    expect(options).toMatchObject({ publicBaseUrl: 'https://media.example.com', keyPrefix: 'uploads/' })
    expect(options?.bucket).toBeDefined()
  })

  it('yields a working R2 provider when enabled with a binding and config', async () => {
    const provider = createStorageProvider({ enabled: true, config, env: { MEDIA_R2: fakeBucket() } })

    await expect(provider.put({ key: 'a.png', body: 'x' })).resolves.toMatchObject({ key: 'uploads/a.png' })
    expect(provider.publicUrl('a.png')).toBe('https://media.example.com/uploads/a.png')
  })

  it('yields the unconfigured no-op when storage is disabled', async () => {
    const provider = createStorageProvider({ enabled: false, config, env: { MEDIA_R2: fakeBucket() } })

    await expect(provider.put({ key: 'a.png', body: 'x' })).rejects.toThrow(/not configured/)
    await expect(provider.head('a.png')).resolves.toBeNull()
  })

  it('yields the unconfigured no-op when the binding is missing', async () => {
    const provider = createStorageProvider({ enabled: true, config, env: {} })

    await expect(provider.put({ key: 'a.png', body: 'x' })).rejects.toThrow(/not configured/)
  })
})
