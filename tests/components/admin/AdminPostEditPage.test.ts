import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, shallowRef } from 'vue'

const api = vi.hoisted(() => ({
  apiErrorMessage: vi.fn(),
  previewMarkdown: vi.fn(),
  updatePost: vi.fn(),
  uploadMedia: vi.fn(),
  useAdminIntegrations: vi.fn(),
  useAdminTaxonomyOptions: vi.fn()
}))

vi.mock('~/composables/useAdminApi', () => api)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function mountPageWithoutWaiting() {
  const Page = (await import('../../../pages/admin/posts/[id].vue')).default
  const Host = defineComponent({
    components: { Page },
    template: '<Suspense><Page /></Suspense>'
  })
  return mount(Host, {
    global: { stubs: { NuxtLink: true, PostEditor: true } }
  })
}

describe('admin post edit page analytics retirement', () => {
  const source = readFileSync(resolve(process.cwd(), 'pages/admin/posts/[id].vue'), 'utf8')

  it('renders the editor without the removed snapshot analytics card or endpoint', () => {
    expect(source).toMatch(/<PostEditor\r?\n\s+v-if="initialPost"/)
    expect(source).not.toContain('post-analytics-card')
    expect(source).not.toContain('fetchAdminArticleAnalytics')
    expect(source).not.toContain('refreshArticleAnalytics')
  })
})

describe('admin post edit page reads', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useRoute', () => ({ params: { id: 'post-1' } }))
    vi.stubGlobal('useRequestFetch', () => vi.fn())
    vi.stubGlobal('useAsyncData', vi.fn().mockResolvedValue({
      data: shallowRef(null),
      error: shallowRef(null),
      refresh: vi.fn()
    }))
    api.useAdminTaxonomyOptions.mockResolvedValue({
      data: shallowRef({ data: { categories: [], tags: [] }, meta: {} })
    })
    api.useAdminIntegrations.mockResolvedValue({
      data: shallowRef({ data: [], meta: {} }),
      refresh: vi.fn()
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('starts integration and post reads before the taxonomy read resolves', async () => {
    const taxonomyResult = {
      data: shallowRef({ data: { categories: [], tags: [] }, meta: {} })
    }
    const pendingTaxonomy = deferred<typeof taxonomyResult>()
    api.useAdminTaxonomyOptions.mockReturnValueOnce(pendingTaxonomy.promise)

    const wrapper = await mountPageWithoutWaiting()

    expect(api.useAdminIntegrations).toHaveBeenCalledOnce()
    expect(vi.mocked(useAsyncData)).toHaveBeenCalledOnce()

    pendingTaxonomy.resolve(taxonomyResult)
    await flushPromises()
    wrapper.unmount()
  })
})
