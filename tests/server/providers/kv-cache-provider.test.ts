import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createKvCacheProvider, type KvNamespaceLike } from '../../../server/providers/cache/kv-cache-provider'

interface PutCall {
  key: string
  value: string
  options?: { expirationTtl?: number }
}

function createFakeKv() {
  const store = new Map<string, string>()
  const calls = { get: [] as string[], put: [] as PutCall[], delete: [] as string[] }
  const kv: KvNamespaceLike = {
    async get(key: string) {
      calls.get.push(key)
      return store.has(key) ? store.get(key)! : null
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      calls.put.push({ key, value, options })
      store.set(key, value)
    },
    async delete(key: string) {
      calls.delete.push(key)
      store.delete(key)
    }
  }
  return { kv, store, calls }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('kv cache provider', () => {
  it('round-trips a JSON value and applies the key prefix', async () => {
    const { kv, calls } = createFakeKv()
    const cache = createKvCacheProvider({ kv, keyPrefix: 'tblog:' })

    await cache.set('post-slug:hello', { title: 'Hello' })
    const value = await cache.get<{ title: string }>('post-slug:hello')

    expect(value).toEqual({ title: 'Hello' })
    expect(calls.put[0].key).toBe('tblog:post-slug:hello')
    expect(calls.get[0]).toBe('tblog:post-slug:hello')
  })

  it('returns null on a miss', async () => {
    const { kv } = createFakeKv()
    const cache = createKvCacheProvider({ kv })

    await expect(cache.get('absent')).resolves.toBeNull()
  })

  it('applies the default TTL to writes without an explicit TTL', async () => {
    const { kv, calls } = createFakeKv()
    const cache = createKvCacheProvider({ kv, defaultTtlSeconds: 300 })

    await cache.set('home', [1, 2, 3])

    expect(calls.put[0].options).toEqual({ expirationTtl: 300 })
  })

  it('coalesces duplicate writes within one request-scoped provider and suppresses an immediate repeat', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const put = vi.fn(async () => { await gate })
    const kv: KvNamespaceLike = {
      async get() { return null },
      put,
      async delete() {}
    }
    const cache = createKvCacheProvider({ kv, keyPrefix: 'dedupe:' })

    const first = cache.set('home', 'value')
    const second = cache.set('home', 'value')
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    release()
    await Promise.all([first, second])
    await cache.set('home', 'value')

    expect(put).toHaveBeenCalledTimes(1)
  })

  it('serializes different values written to the same key so the latest value wins', async () => {
    vi.useFakeTimers()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const put = vi.fn()
      .mockImplementationOnce(async () => { await gate })
      .mockResolvedValueOnce(undefined)
    const kv: KvNamespaceLike = {
      async get() { return null },
      put,
      async delete() {}
    }
    const cache = createKvCacheProvider({ kv })

    const first = cache.set('home', 'old')
    const second = cache.set('home', 'new')
    await Promise.resolve()
    expect(put).toHaveBeenCalledTimes(1)
    release()
    await first
    await vi.advanceTimersByTimeAsync(1_000)
    await second

    expect(put.mock.calls.map((call) => call[1])).toEqual(['"old"', '"new"'])
    vi.useRealTimers()
  })

  it('omits the TTL when neither a default nor an explicit TTL is set', async () => {
    const { kv, calls } = createFakeKv()
    const cache = createKvCacheProvider({ kv })

    await cache.set('home', 'x')

    expect(calls.put[0].options).toBeUndefined()
  })

  it('clamps a sub-minimum TTL up to the KV floor of 60 seconds', async () => {
    const { kv, calls } = createFakeKv()
    const cache = createKvCacheProvider({ kv })

    await cache.set('home', 'x', 30)

    expect(calls.put[0].options).toEqual({ expirationTtl: 60 })
  })

  it('deletes every requested key with the prefix applied', async () => {
    const { kv, calls } = createFakeKv()
    const cache = createKvCacheProvider({ kv, keyPrefix: 'p:' })

    await cache.delete(['home', 'archive'])

    expect(calls.delete).toEqual(['p:home', 'p:archive'])
  })

  it('degrades a failing get to a miss instead of throwing', async () => {
    const kv: KvNamespaceLike = {
      async get() {
        throw new Error('kv down')
      },
      async put() {},
      async delete() {}
    }
    const cache = createKvCacheProvider({ kv })

    await expect(cache.get('home')).resolves.toBeNull()
  })

  it('swallows a failing set and delete instead of throwing', async () => {
    const kv: KvNamespaceLike = {
      async get() {
        return null
      },
      async put() {
        throw new Error('kv down')
      },
      async delete() {
        throw new Error('kv down')
      }
    }
    const cache = createKvCacheProvider({ kv })

    await expect(cache.set('home', 'x')).resolves.toBeUndefined()
    await expect(cache.delete(['home'])).resolves.toBeUndefined()
  })

  it('runs the delete fallback when KV deletion fails and swallows fallback errors', async () => {
    const onDeleteFailure = vi.fn(async () => { throw new Error('fallback down') })
    const kv: KvNamespaceLike = {
      async get() { return null },
      async put() {},
      async delete() { throw new Error('kv down') }
    }
    const cache = createKvCacheProvider({ kv, onDeleteFailure })

    await expect(cache.delete(['home'])).resolves.toBeUndefined()
    expect(onDeleteFailure).toHaveBeenCalledOnce()
  })

  it('degrades corrupt stored JSON to a miss', async () => {
    const { kv, store } = createFakeKv()
    store.set('home', 'not json{')
    const cache = createKvCacheProvider({ kv })

    await expect(cache.get('home')).resolves.toBeNull()
  })
})
