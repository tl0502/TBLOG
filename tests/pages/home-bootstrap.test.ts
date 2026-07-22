import { createApp, createSSRApp, h, nextTick, reactive, shallowRef, Suspense } from 'vue'
import { renderToString } from 'vue/server-renderer'

const api = vi.hoisted(() => ({ useHomeBootstrap: vi.fn() }))
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

describe('public home page bootstrap boundary', () => {
  beforeEach(() => {
    route.query = {}
    navigateTo.mockReset()
    api.useHomeBootstrap.mockReset()
    seo.useHomeSeo.mockReset()
  })

  it('waits for one bootstrap result before rendering the homepage', async () => {
    const request = deferred<{
      data: ReturnType<typeof shallowRef>
      status: ReturnType<typeof shallowRef>
      error: ReturnType<typeof shallowRef>
    }>()
    api.useHomeBootstrap.mockReturnValue(request.promise)
    const page = await import('../../pages/index.vue')
    const render = renderToString(createSSRApp(page.default))
    let completed = false
    void render.then(() => { completed = true })

    await Promise.resolve()
    expect(api.useHomeBootstrap).toHaveBeenCalledOnce()
    expect(completed).toBe(false)

    request.resolve({
      data: shallowRef({
        data: {
          feed: {
            items: [],
            meta: {
              page: 1, pageSize: 25, total: 0, pageCount: 0,
              sort: 'publishedAt', order: 'desc'
            }
          },
          featured: [],
          hotspots: { current: [], historical: [] },
          homeRail: { cards: {} },
          tags: []
        },
        meta: { degraded: [] }
      }),
      status: shallowRef('success'),
      error: shallowRef(null)
    })

    await expect(render).resolves.toContain('data-test="home-view"')
    expect(seo.useHomeSeo).toHaveBeenCalledOnce()
  })

  it('does not let stale bootstrap metadata roll a new pagination query back', async () => {
    const bootstrap = shallowRef({
      data: {
        feed: {
          items: [],
          meta: {
            page: 1, pageSize: 25, total: 27, pageCount: 2,
            sort: 'publishedAt' as const, order: 'desc' as const
          }
        },
        featured: [],
        hotspots: { current: [], historical: [] },
        homeRail: { cards: {} },
        tags: []
      },
      meta: { degraded: [] }
    })
    api.useHomeBootstrap.mockResolvedValue({ data: bootstrap, error: shallowRef(null) })
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

    bootstrap.value = {
      ...bootstrap.value,
      data: {
        ...bootstrap.value.data,
        feed: {
          ...bootstrap.value.data.feed,
          meta: { ...bootstrap.value.data.feed.meta, page: 2 }
        }
      }
    }
    await nextTick()
    expect(navigateTo).not.toHaveBeenCalled()

    route.query = { sort: 'publishedAt', order: 'desc', page: '8' }
    await nextTick()
    expect(navigateTo).not.toHaveBeenCalled()

    bootstrap.value = {
      ...bootstrap.value,
      data: {
        ...bootstrap.value.data,
        feed: {
          ...bootstrap.value.data.feed,
          meta: { ...bootstrap.value.data.feed.meta, page: 2 }
        }
      }
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
