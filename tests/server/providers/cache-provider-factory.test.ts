import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../server/database/client', () => ({
  getDatabaseClient: vi.fn(() => ({}))
}))

const findByCapabilityAndProvider = vi.fn()
const touch = vi.fn()
vi.mock('../../../server/repositories/integration-settings-repository', () => ({
  createIntegrationSettingsRepository: vi.fn(() => ({ findByCapabilityAndProvider, touch }))
}))

import { getDatabaseClient } from '../../../server/database/client'
import {
  CACHE_GENERATION_SAFETY_TTL_SECONDS,
  CACHE_RESOURCE_DELETE_LIMIT,
  CACHE_ROTATION_FAILURE_DELETE_LIMIT,
  CACHE_SCHEMA_VERSION,
  createCacheProviderForEvent,
  resolveKvCacheOptions
} from '../../../server/providers/cache/cache-provider-factory'

function createFakeKv() {
  const store = new Map<string, string>()
  const calls = {
    put: [] as { key: string; options?: { expirationTtl?: number } }[],
    delete: [] as string[]
  }
  const kv = {
    async get(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      calls.put.push({ key, options })
      store.set(key, value)
    },
    async delete(key: string) {
      calls.delete.push(key)
      store.delete(key)
    }
  }
  return { kv, store, calls }
}

function makeEvent(env: Record<string, unknown>) {
  return { context: { cloudflare: { env } } } as never
}

beforeEach(() => {
  findByCapabilityAndProvider.mockReset()
  touch.mockReset()
  touch.mockResolvedValue(undefined)
  vi.mocked(getDatabaseClient).mockReturnValue({} as never)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveKvCacheOptions', () => {
  it('returns null when the CACHE_KV binding is absent', () => {
    expect(resolveKvCacheOptions({ keyPrefix: 'p:' }, {})).toBeNull()
  })

  it('resolves prefix and TTL when the binding is present', () => {
    const { kv } = createFakeKv()

    const options = resolveKvCacheOptions({ keyPrefix: 'p:', ttlSeconds: 120 }, { CACHE_KV: kv })

    expect(options).toMatchObject({ keyPrefix: 'p:', defaultTtlSeconds: 120 })
    expect(options?.kv).toBe(kv)
  })
})

describe('createCacheProviderForEvent', () => {
  it('returns a no-op without any database read when no KV binding is present', async () => {
    const cache = createCacheProviderForEvent(makeEvent({}))

    await expect(cache.get('home')).resolves.toBeNull()
    expect(getDatabaseClient).not.toHaveBeenCalled()
    expect(findByCapabilityAndProvider).not.toHaveBeenCalled()
  })

  it('returns a no-op when the cache integration row is disabled', async () => {
    findByCapabilityAndProvider.mockResolvedValue({ enabled: false, publicConfigJson: null })
    const { kv, store } = createFakeKv()
    store.set('home', JSON.stringify('cached'))

    const cache = createCacheProviderForEvent(makeEvent({ CACHE_KV: kv }))

    await expect(cache.get('home')).resolves.toBeNull()
    expect(findByCapabilityAndProvider).toHaveBeenCalledWith('cache', 'cloudflare-kv')
  })

  it('returns the KV-backed provider when the row is enabled and the binding is present', async () => {
    findByCapabilityAndProvider.mockResolvedValue({
      enabled: true,
      publicConfigJson: JSON.stringify({ keyPrefix: '', ttlSeconds: 120 }),
      updatedAt: new Date(1000)
    })
    const { kv, store } = createFakeKv()
    store.set(`v:${CACHE_SCHEMA_VERSION}:g:1000:home`, JSON.stringify('cached'))

    const cache = createCacheProviderForEvent(makeEvent({ CACHE_KV: kv }))

    await expect(cache.get('home')).resolves.toBe('cached')
  })

  it('memoizes resolution across calls (one integration lookup per request)', async () => {
    findByCapabilityAndProvider.mockResolvedValue({
      enabled: true,
      publicConfigJson: '{}',
      updatedAt: new Date(1000)
    })
    const { kv } = createFakeKv()
    const cache = createCacheProviderForEvent(makeEvent({ CACHE_KV: kv }))

    await cache.get('home')
    await cache.set('home', 'x')
    await cache.delete(['home'])

    expect(findByCapabilityAndProvider).toHaveBeenCalledTimes(1)
  })

  it('deletes only requested resource keys when KV is active without rotating the generation', async () => {
    findByCapabilityAndProvider.mockResolvedValue({
      enabled: true,
      publicConfigJson: '{}',
      updatedAt: new Date(1000)
    })
    const { kv, store, calls } = createFakeKv()
    store.set(`v:${CACHE_SCHEMA_VERSION}:g:1000:home`, JSON.stringify('home'))
    store.set(`v:${CACHE_SCHEMA_VERSION}:g:1000:archive`, JSON.stringify('archive'))

    await createCacheProviderForEvent(makeEvent({ CACHE_KV: kv })).delete(['home'])

    expect(calls.delete).toEqual([`v:${CACHE_SCHEMA_VERSION}:g:1000:home`])
    expect(store.has(`v:${CACHE_SCHEMA_VERSION}:g:1000:home`)).toBe(false)
    expect(store.has(`v:${CACHE_SCHEMA_VERSION}:g:1000:archive`)).toBe(true)
    expect(touch).not.toHaveBeenCalled()
  })

  it('applies a bounded safety TTL when the administrator leaves TTL blank', async () => {
    findByCapabilityAndProvider.mockResolvedValue({
      enabled: true,
      publicConfigJson: '{}',
      updatedAt: new Date(1000)
    })
    const { kv, calls } = createFakeKv()

    await createCacheProviderForEvent(makeEvent({ CACHE_KV: kv })).set('home', 'value')

    expect(calls.put[0]).toEqual({
      key: `v:${CACHE_SCHEMA_VERSION}:g:1000:home`,
      options: { expirationTtl: CACHE_GENERATION_SAFETY_TTL_SECONDS }
    })
  })

  it('falls back to a best-effort generation rotation when KV deletion fails', async () => {
    findByCapabilityAndProvider.mockResolvedValue({
      enabled: true,
      publicConfigJson: '{}',
      updatedAt: new Date(1000)
    })
    const { kv } = createFakeKv()
    kv.delete = vi.fn(async () => { throw new Error('kv down') })

    await expect(createCacheProviderForEvent(makeEvent({ CACHE_KV: kv })).delete(['home']))
      .resolves.toBeUndefined()
    expect(touch).toHaveBeenCalledOnce()
  })

  it('rotates the generation instead of issuing a large fan-out delete', async () => {
    const { kv, calls } = createFakeKv()
    const keys = Array.from({ length: CACHE_RESOURCE_DELETE_LIMIT + 1 }, (_, index) => `post:${index}`)

    await createCacheProviderForEvent(makeEvent({ CACHE_KV: kv })).delete(keys)

    expect(touch).toHaveBeenCalledOnce()
    expect(calls.delete).toEqual([])
    expect(findByCapabilityAndProvider).not.toHaveBeenCalled()
  })

  it('falls back to a bounded exact delete when large-invalidation rotation fails', async () => {
    touch.mockRejectedValue(new Error('d1 down'))
    findByCapabilityAndProvider.mockResolvedValue({
      enabled: true,
      publicConfigJson: '{}',
      updatedAt: new Date(1000)
    })
    const { kv, calls } = createFakeKv()
    const keys = Array.from(
      { length: CACHE_ROTATION_FAILURE_DELETE_LIMIT + 1 },
      (_, index) => `post:${index}`
    )

    await createCacheProviderForEvent(makeEvent({ CACHE_KV: kv })).delete(keys)

    expect(calls.delete).toHaveLength(CACHE_ROTATION_FAILURE_DELETE_LIMIT)
    expect(calls.delete[0]).toBe(`v:${CACHE_SCHEMA_VERSION}:g:1000:post:0`)
    expect(calls.delete.at(-1)).toBe(
      `v:${CACHE_SCHEMA_VERSION}:g:1000:post:${CACHE_ROTATION_FAILURE_DELETE_LIMIT - 1}`
    )
  })

  it('rotates the generation for a strong withdrawal without deleting individual keys', async () => {
    const { kv, calls } = createFakeKv()

    await createCacheProviderForEvent(makeEvent({ CACHE_KV: kv }))
      .delete(['post-slug:withdrawn'], { forceGeneration: true })

    expect(touch).toHaveBeenCalledOnce()
    expect(calls.delete).toEqual([])
  })

  it('falls back to exact deletion when a strong-withdrawal generation rotation fails', async () => {
    touch.mockRejectedValue(new Error('d1 down'))
    findByCapabilityAndProvider.mockResolvedValue({
      enabled: true,
      publicConfigJson: '{}',
      updatedAt: new Date(1000)
    })
    const { kv, calls } = createFakeKv()

    await createCacheProviderForEvent(makeEvent({ CACHE_KV: kv }))
      .delete(['post-slug:withdrawn'], { forceGeneration: true })

    expect(calls.delete).toEqual([`v:${CACHE_SCHEMA_VERSION}:g:1000:post-slug:withdrawn`])
  })

  it('rotates the persisted generation when invalidation happens while the integration is disabled', async () => {
    let record = {
      enabled: false,
      publicConfigJson: '{}',
      updatedAt: new Date(1000)
    }
    findByCapabilityAndProvider.mockImplementation(async () => record)
    touch.mockImplementation(async (_capability, _provider, updatedAt: Date) => {
      record = { ...record, updatedAt }
    })
    const { kv, store } = createFakeKv()
    store.set(`v:${CACHE_SCHEMA_VERSION}:g:1000:post-slug:old`, JSON.stringify('stale'))

    await createCacheProviderForEvent(makeEvent({ CACHE_KV: kv })).delete(['post-slug:old'])
    record = { ...record, enabled: true }

    await expect(
      createCacheProviderForEvent(makeEvent({ CACHE_KV: kv })).get('post-slug:old')
    ).resolves.toBeNull()
    expect(touch).toHaveBeenCalledTimes(1)
  })

  it('rotates the persisted generation without a binding while keeping no-binding reads query-free', async () => {
    let record = {
      enabled: true,
      publicConfigJson: '{}',
      updatedAt: new Date(1000)
    }
    findByCapabilityAndProvider.mockImplementation(async () => record)
    touch.mockImplementation(async (_capability, _provider, updatedAt: Date) => {
      record = { ...record, updatedAt }
    })
    const { kv, store } = createFakeKv()
    store.set(`v:${CACHE_SCHEMA_VERSION}:g:1000:post-slug:old`, JSON.stringify('stale'))

    await createCacheProviderForEvent(makeEvent({})).delete(['post-slug:old'])

    await expect(
      createCacheProviderForEvent(makeEvent({ CACHE_KV: kv })).get('post-slug:old')
    ).resolves.toBeNull()
    expect(touch).toHaveBeenCalledTimes(1)
  })

  it('never propagates a failed generation fallback into the core write flow', async () => {
    touch.mockRejectedValue(new Error('d1 touch down'))

    await expect(createCacheProviderForEvent(makeEvent({})).delete(['home']))
      .resolves.toBeUndefined()
  })

  it('degrades malformed persisted cache configuration to a no-op', async () => {
    findByCapabilityAndProvider.mockResolvedValue({
      enabled: true,
      publicConfigJson: JSON.stringify({ ttlSeconds: 10 }),
      updatedAt: new Date(1000)
    })
    const { kv } = createFakeKv()

    await expect(createCacheProviderForEvent(makeEvent({ CACHE_KV: kv })).get('home'))
      .resolves.toBeNull()
  })
})
