import { createApp, createSSRApp, h, nextTick, reactive, shallowRef, Suspense } from 'vue'
import { renderToString } from 'vue/server-renderer'

const api = vi.hoisted(() => ({
  useHomeShell: vi.fn(),
  usePostFeed: vi.fn(),
  prefetchPostFeed: vi.fn()
}))
const seo = vi.hoisted(() => ({ useHomeSeo: vi.fn() }))

vi.mock('~/composables/usePublicApi', () => api)
vi.mock('~/composables/useSeo', () => seo)
vi.mock('~/composables/useSiteConfig', async () => {
  const { shallowRef } = await import('vue')
  return {
    useOptionalPublicSiteConfigData: () => shallowRef({
      data: {
        profile: null,
        home: { railCards: [] },
        site: { featuredFallbackCover: null }
      },
      meta: {}
    })
  }
})
vi.mock('~/components/home/HomeView.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'HomeViewStub',
      setup: () => () => h('div', { 'data-test': 'home-view' })
    })
  }
})

const route = reactive<{ query: Record<string, string> }>({ query: {} })
const navigateTo = vi.fn()

vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('navigateTo', navigateTo)
vi.stubGlobal('definePageMeta', vi.fn())

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function emptyShell() {
  return shallowRef({
    data: {
      feed: {
        items: [],
        meta: {
          page: 1, pageSize: 25, total: 0, pageCount: 0,
          sort: 'publishedAt' as const, order: 'desc' as const
        }
      },
      featured: [],
      hotspots: { current: [], historical: [] },
      homeRail: { cards: {} },
      tags: []
    },
    meta: { degraded: [], includeFeed: false }
  })
}

function emptyFeed(meta: Record<string, unknown> = {}) {
  return shallowRef({
    data: [],
    meta: {
      page: 1,
      pageSize: 25,
      total: 0,
      pageCount: 0,
      sort: 'publishedAt',
      order: 'desc',
      ...meta
    }
  })
}

describe('public home page bootstrap boundary', () => {
  beforeEach(() => {
    route.query = {}
    navigateTo.mockReset()
    api.useHomeShell.mockReset()
    api.usePostFeed.mockReset()
    api.prefetchPostFeed.mockReset()
    seo.useHomeSeo.mockReset()
  })

  it('waits for shell and feed before rendering the homepage', async () => {
    const shellRequest = deferred<{
      data: ReturnType<typeof shallowRef>
      status: ReturnType<typeof shallowRef>
      error: ReturnType<typeof shallowRef>
    }>()
    const feedRequest = deferred<{
      data: ReturnType<typeof shallowRef>
      status: ReturnType<typeof shallowRef>
      error: ReturnType<typeof shallowRef>
    }>()
    api.useHomeShell.mockReturnValue(shellRequest.promise)
    api.usePostFeed.mockReturnValue(feedRequest.promise)
    const page = await import('../../pages/index.vue')
    const render = renderToString(createSSRApp(page.default))
    let completed = false
    void render.then(() => { completed = true })

    await Promise.resolve()
    expect(api.useHomeShell).toHaveBeenCalledOnce()
    expect(api.usePostFeed).toHaveBeenCalledOnce()
    expect(completed).toBe(false)

    shellRequest.resolve({
      data: emptyShell(),
      status: shallowRef('success'),
      error: shallowRef(null)
    })
    await Promise.resolve()
    expect(completed).toBe(false)

    feedRequest.resolve({
      data: emptyFeed(),
      status: shallowRef('success'),
      error: shallowRef(null)
    })

    await expect(render).resolves.toContain('data-test="home-view"')
    expect(seo.useHomeSeo).toHaveBeenCalledOnce()
  })

  it('loads feed for the active page independently of the shell', async () => {
    route.query = { page: '3', sort: 'publishedAt', order: 'desc' }
    api.useHomeShell.mockResolvedValue({ data: emptyShell(), error: shallowRef(null) })
    api.usePostFeed.mockResolvedValue({ data: emptyFeed({ page: 3, total: 60, pageCount: 3 }), error: shallowRef(null) })
    const page = await import('../../pages/index.vue')
    const container = document.createElement('div')
    const app = createApp({
      setup: () => () => h(Suspense, null, { default: () => h(page.default) })
    })
    app.mount(container)
    await Promise.resolve()
    await nextTick()

    expect(api.useHomeShell).toHaveBeenCalledOnce()
    const feedQueryArg = api.usePostFeed.mock.calls[0]?.[0]
    expect(feedQueryArg?.value ?? feedQueryArg).toMatchObject({ page: 3, limit: 25 })

    app.unmount()
  })

  it('does not let stale feed metadata roll a new pagination query back', async () => {
    const feed = emptyFeed({ page: 1, total: 27, pageCount: 2 })
    api.useHomeShell.mockResolvedValue({ data: emptyShell(), error: shallowRef(null) })
    api.usePostFeed.mockResolvedValue({ data: feed, error: shallowRef(null) })
    const page = await import('../../pages/index.vue')
    const container = document.createElement('div')
    const app = createApp({
      setup: () => () => h(Suspense, null, { default: () => h(page.default) })
    })
    app.mount(container)
    await Promise.resolve()
    await nextTick()

    route.query = { sort: 'publishedAt', order: 'desc', page: '2' }
    await nextTick()
    expect(navigateTo).not.toHaveBeenCalled()

    feed.value = {
      ...feed.value,
      meta: { ...feed.value.meta, page: 2 }
    }
    await nextTick()
    expect(navigateTo).not.toHaveBeenCalled()

    route.query = { sort: 'publishedAt', order: 'desc', page: '8' }
    await nextTick()
    expect(navigateTo).not.toHaveBeenCalled()

    feed.value = {
      ...feed.value,
      meta: { ...feed.value.meta, page: 2 }
    }
    await nextTick()
    expect(navigateTo).toHaveBeenCalledWith({
      path: '/',
      query: { sort: 'publishedAt', order: 'desc', page: '2' },
      hash: '#articles'
    }, { replace: true })

    app.unmount()
  })
})
