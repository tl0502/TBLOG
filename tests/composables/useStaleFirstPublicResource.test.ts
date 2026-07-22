import { createApp, h, nextTick, shallowRef } from 'vue'
import {
  clearStaleFirstPublicResourceCache,
  publicResourceKey,
  useStaleFirstPublicResource
} from '../../composables/useStaleFirstPublicResource'

const asyncDataState = vi.hoisted(() => ({
  calls: [] as Array<{
    handler: (_app: unknown, context: { signal: AbortSignal }) => Promise<unknown>
    data: ReturnType<typeof shallowRef>
    error: ReturnType<typeof shallowRef>
    options: { dedupe?: string }
  }>,
  hydrating: false,
  initialError: null as unknown
}))

vi.stubGlobal('useNuxtApp', () => ({ isHydrating: asyncDataState.hydrating }))
vi.stubGlobal('useAsyncData', (key: string, handler: (_app: unknown, context: { signal: AbortSignal }) => Promise<unknown>, options: { dedupe?: string; getCachedData?: (key: string, app: { isHydrating: boolean; payload: { data: Record<string, unknown> }; static: { data: Record<string, unknown> } }) => unknown }) => {
  const app = { isHydrating: asyncDataState.hydrating, payload: { data: {} }, static: { data: {} } }
  const data = shallowRef(options.getCachedData?.(key, app))
  const error = shallowRef<unknown>(asyncDataState.initialError)
  asyncDataState.calls.push({ handler, data, error, options })
  return {
    data,
    error,
    refresh: async () => {
      const value = await handler(app, { signal: new AbortController().signal })
      data.value = value
      return value
    }
  }
})

function flush() {
  return Promise.resolve().then(() => nextTick())
}

describe('stale-first public resource keys', () => {
  beforeEach(() => {
    clearStaleFirstPublicResourceCache()
    asyncDataState.calls.length = 0
    asyncDataState.hydrating = false
    asyncDataState.initialError = null
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ value: 'fresh' }))
  })

  it('is stable across query property order and separates page identities', () => {
    expect(publicResourceKey('home', { page: 2, sort: 'pageViews', order: 'desc' }))
      .toBe(publicResourceKey('home', { order: 'desc', sort: 'pageViews', page: 2 }))
    expect(publicResourceKey('home', { page: 1 })).not.toBe(publicResourceKey('home', { page: 2 }))
    expect(publicResourceKey('categories/nuxt')).not.toBe(publicResourceKey('categories/vue'))
  })

  it('hydrates a session response and keeps stale data when revalidation fails', async () => {
    if (!import.meta.client) return
    const first = useStaleFirstPublicResource<{ value: string }>('/api/v1/example', { key: 'example' })
    await first.refresh()

    const state = shallowRef<any>(null)
    const container = document.createElement('div')
    const app = createApp({
      setup: () => {
        state.value = useStaleFirstPublicResource<{ value: string }>('/api/v1/example', { key: 'example' })
        return () => h('div')
      }
    })
    app.mount(container)
    await flush()
    await flush()
    expect(state.value?.data.value).toEqual({ value: 'fresh' })

    app.unmount()

    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('provider unavailable')))
    const staleState = shallowRef<any>(null)
    const staleApp = createApp({
      setup: () => {
        staleState.value = useStaleFirstPublicResource<{ value: string }>('/api/v1/example', { key: 'example' })
        return () => h('div')
      }
    })
    staleApp.mount(document.createElement('div'))
    await flush()
    expect(staleState.value?.data.value).toEqual({ value: 'fresh' })
    staleApp.unmount()
  })

  it('defers duplicate work and forwards Nuxt cancellation to the request', async () => {
    const request = vi.fn().mockResolvedValue({ value: 'fresh' })
    vi.stubGlobal('$fetch', request)
    useStaleFirstPublicResource<{ value: string }>('/api/v1/example', { key: 'example' })

    const call = asyncDataState.calls[0]!
    const controller = new AbortController()
    await call.handler({}, { signal: controller.signal })

    expect(call.options.dedupe).toBe('defer')
    expect(request).toHaveBeenCalledWith('/api/v1/example', expect.objectContaining({
      signal: controller.signal
    }))
  })

  it('retries a hydrated infrastructure failure but not authoritative 404/410 responses', async () => {
    if (!import.meta.client) return
    asyncDataState.hydrating = true
    asyncDataState.initialError = Object.assign(new Error('unavailable'), { statusCode: 503 })
    const request = vi.fn().mockResolvedValue({ value: 'recovered' })
    vi.stubGlobal('$fetch', request)

    const first = createApp({
      setup: () => {
        useStaleFirstPublicResource<{ value: string }>('/api/v1/recover', { key: 'recover' })
        return () => h('div')
      }
    })
    first.mount(document.createElement('div'))
    await flush()
    await flush()
    expect(request).toHaveBeenCalledOnce()
    first.unmount()

    clearStaleFirstPublicResourceCache()
    request.mockClear()
    for (const statusCode of [404, 410]) {
      asyncDataState.initialError = Object.assign(new Error('not found'), { statusCode })
      const missing = createApp({
        setup: () => {
          useStaleFirstPublicResource<{ value: string }>(`/api/v1/missing-${statusCode}`, {
            key: `missing-${statusCode}`
          })
          return () => h('div')
        }
      })
      missing.mount(document.createElement('div'))
      await flush()
      expect(request).not.toHaveBeenCalled()
      missing.unmount()
    }
  })

  it('aborts manual session revalidation when its owner is disposed', async () => {
    if (!import.meta.client) return
    const first = useStaleFirstPublicResource<{ value: string }>('/api/v1/example', { key: 'example' })
    await first.refresh()

    let requestSignal: AbortSignal | undefined
    vi.stubGlobal('$fetch', vi.fn((_request, options: { signal?: AbortSignal }) => {
      requestSignal = options.signal
      return new Promise(() => {})
    }))
    const app = createApp({
      setup: () => {
        useStaleFirstPublicResource<{ value: string }>('/api/v1/example', { key: 'example' })
        return () => h('div')
      }
    })
    app.mount(document.createElement('div'))
    await flush()
    expect(requestSignal?.aborted).toBe(false)

    app.unmount()
    expect(requestSignal?.aborted).toBe(true)
  })

  it('clears cached public data when revalidation authoritatively returns not found', async () => {
    if (!import.meta.client) return
    const first = useStaleFirstPublicResource<{ value: string }>('/api/v1/example', { key: 'example' })
    await first.refresh()

    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(
      Object.assign(new Error('not found'), { statusCode: 404 })
    ))
    const state = shallowRef<any>(null)
    const app = createApp({
      setup: () => {
        state.value = useStaleFirstPublicResource<{ value: string }>('/api/v1/example', { key: 'example' })
        return () => h('div')
      }
    })
    app.mount(document.createElement('div'))

    await flush()
    await flush()

    expect(state.value?.data.value).toBeNull()
    expect(state.value?.error.value).toMatchObject({ statusCode: 404 })
    app.unmount()

    const next = useStaleFirstPublicResource<{ value: string }>('/api/v1/example', { key: 'example' })
    expect(next.data.value).toBeUndefined()
  })
})
