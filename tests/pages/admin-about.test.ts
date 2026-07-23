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
    vi.stubGlobal('useRequestFetch', () => vi.fn().mockResolvedValue({ data: null, meta: {} }))
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

    expect(asyncResult).toEqual({ post: null })
    expect(nullResultWarning).not.toHaveBeenCalled()
    expect(wrapper.get('[data-test="about-editor"]').text()).toBe('about')
  })
})
