import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, shallowRef } from 'vue'

const api = vi.hoisted(() => ({
  apiErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
  createPost: vi.fn(),
  fetchAdminPost: vi.fn(),
  previewMarkdown: vi.fn(),
  updatePost: vi.fn()
}))

vi.mock('~/composables/useAdminApi', () => api)
vi.mock('~/composables/useTblogI18n', () => ({
  useTblogI18n: () => ({ t: (key: string) => key })
}))

const PostEditor = defineComponent({
  name: 'PostEditor',
  props: {
    initialPost: { type: Object, required: true }
  },
  template: '<div data-test="about-editor">{{ initialPost.slug }}</div>'
})

const requestFetch = vi.fn()

async function mountPage() {
  const Page = (await import('../../pages/admin/about.vue')).default
  const Host = defineComponent({
    components: { Page },
    template: '<Suspense><Page /></Suspense>'
  })
  const wrapper = mount(Host, { global: { stubs: { PostEditor } } })
  await flushPromises()
  return wrapper
}

describe('admin About page', () => {
  let asyncResult: unknown
  const nullResultWarning = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    asyncResult = undefined
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useRequestFetch', () => requestFetch)
    requestFetch.mockResolvedValue({ data: [], meta: { total: 0, offset: 0, limit: 1 } })
    vi.stubGlobal('useAsyncData', vi.fn(async (_key: string, handler: () => Promise<unknown>) => {
      asyncResult = await handler()
      if (asyncResult == null) nullResultWarning()
      return {
        data: shallowRef(asyncResult),
        error: shallowRef(null)
      }
    }))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('returns a non-null async-data result when the About post does not exist', async () => {
    const wrapper = await mountPage()

    expect(requestFetch).toHaveBeenCalledWith('/api/v1/admin/posts', {
      query: { slug: 'about', limit: 1, offset: 0 }
    })
    expect(asyncResult).toEqual({ post: null })
    expect(nullResultWarning).not.toHaveBeenCalled()
    expect(wrapper.get('[data-test="about-editor"]').text()).toBe('about')
  })

  it('loads the edit view after resolving the about slug via the paged list', async () => {
    requestFetch
      .mockResolvedValueOnce({
        data: [{ id: 'about-id', slug: 'about', title: 'About' }],
        meta: { total: 1, offset: 0, limit: 1 }
      })
      .mockResolvedValueOnce({
        data: {
          id: 'about-id',
          slug: 'about',
          title: 'About',
          type: 'page',
          status: 'draft',
          markdown: '# Hi',
          customExcerpt: null,
          seoTitle: null,
          seoDescription: null,
          canonicalUrlOverride: null,
          openGraphImageUrl: null,
          twitterImageUrl: null,
          jsonLdOverrideJson: null
        },
        meta: {}
      })

    const wrapper = await mountPage()

    expect(requestFetch).toHaveBeenNthCalledWith(1, '/api/v1/admin/posts', {
      query: { slug: 'about', limit: 1, offset: 0 }
    })
    expect(requestFetch).toHaveBeenNthCalledWith(2, '/api/v1/admin/posts/about-id')
    expect(asyncResult).toMatchObject({ post: { id: 'about-id', slug: 'about' } })
    expect(wrapper.get('[data-test="about-editor"]').text()).toBe('about')
  })
})
