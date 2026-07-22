import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, shallowRef } from 'vue'

const api = vi.hoisted(() => ({
  apiErrorMessage: vi.fn(),
  createPost: vi.fn(),
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
  const Page = (await import('../../pages/admin/posts/new.vue')).default
  const Host = defineComponent({
    components: { Page },
    template: '<Suspense><Page /></Suspense>'
  })
  return mount(Host, {
    global: { stubs: { NuxtLink: true, PostEditor: true } }
  })
}

describe('admin new post page', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('definePageMeta', vi.fn())
    api.useAdminTaxonomyOptions.mockResolvedValue({
      data: shallowRef({ data: { categories: [], tags: [] }, meta: {} })
    })
    api.useAdminIntegrations.mockResolvedValue({
      data: shallowRef({ data: [], meta: {} })
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('starts the integration read before the taxonomy read resolves', async () => {
    const taxonomyResult = {
      data: shallowRef({ data: { categories: [], tags: [] }, meta: {} })
    }
    const pendingTaxonomy = deferred<typeof taxonomyResult>()
    api.useAdminTaxonomyOptions.mockReturnValueOnce(pendingTaxonomy.promise)

    const wrapper = await mountPageWithoutWaiting()

    expect(api.useAdminIntegrations).toHaveBeenCalledOnce()

    pendingTaxonomy.resolve(taxonomyResult)
    await flushPromises()
    wrapper.unmount()
  })
})
