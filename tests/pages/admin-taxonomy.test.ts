import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, shallowRef } from 'vue'

const api = vi.hoisted(() => ({
  apiErrorMessage: vi.fn((error: unknown, fallback: string) => {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    return message || fallback
  }),
  createCategory: vi.fn(),
  createTag: vi.fn(),
  deleteCategory: vi.fn(),
  deleteTag: vi.fn(),
  mergeTags: vi.fn(),
  updateCategory: vi.fn(),
  updateTag: vi.fn(),
  useAdminCategories: vi.fn(),
  useAdminTags: vi.fn()
}))

vi.mock('~/composables/useAdminApi', () => api)

const CategoryManager = defineComponent({
  name: 'CategoryManager',
  props: {
    categories: { type: Array, required: true },
    saving: Boolean,
    error: String
  },
  emits: ['create', 'update', 'remove'],
  template: `
    <section>
      <p data-test="category-manager-error">{{ error }}</p>
      <span data-test="category-count">{{ categories.length }}</span>
      <span data-test="system-article-count">{{ categories.find((item) => item.isSystem)?.articleCount ?? 0 }}</span>
      <button data-test="category-create" @click="$emit('create', { name: 'New category' })">Create</button>
      <button data-test="category-remove" @click="$emit('remove', 'category-1')">Remove</button>
    </section>
  `
})

const TagManager = defineComponent({
  name: 'TagManager',
  props: {
    tags: { type: Array, required: true },
    saving: Boolean,
    error: String
  },
  emits: ['create', 'update', 'remove', 'merge'],
  template: '<div><p data-test="tag-manager-error">{{ error }}</p><button data-test="tag-merge" @click="$emit(\'merge\', \'tag-1\', \'tag-2\')">Merge</button></div>'
})

function readError(message: string) {
  return { data: { error: { message } } }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function mountPageWithoutWaiting() {
  const Page = (await import('../../pages/admin/taxonomy/index.vue')).default
  const Host = defineComponent({
    components: { Page },
    template: '<Suspense><Page /></Suspense>'
  })
  return mount(Host, {
    global: { stubs: { CategoryManager, TagManager } }
  })
}

async function mountPage() {
  const wrapper = await mountPageWithoutWaiting()
  await flushPromises()
  return wrapper
}

describe('admin taxonomy page', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('definePageMeta', vi.fn())
    api.useAdminCategories.mockResolvedValue({
      data: shallowRef({ data: [], meta: {} }),
      error: shallowRef(readError('Unable to read categories.')),
      refresh: vi.fn()
    })
    api.useAdminTags.mockResolvedValue({
      data: shallowRef({ data: [], meta: {} }),
      error: shallowRef(readError('Unable to read tags.')),
      refresh: vi.fn()
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('passes initial category and tag read errors to their managers', async () => {
    const wrapper = await mountPage()

    expect(wrapper.get('[data-test="category-manager-error"]').text()).toBe('Unable to read categories.')
    expect(wrapper.get('[data-test="tag-manager-error"]').text()).toBe('Unable to read tags.')
  })

  it('shows a mutation error ahead of an existing read error', async () => {
    api.createCategory.mockRejectedValue(readError('Unable to create this category.'))
    const wrapper = await mountPage()

    await wrapper.get('[data-test="category-create"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="category-manager-error"]').text()).toBe('Unable to create this category.')
  })

  it('starts the tag read before the category read resolves', async () => {
    const categoriesResult = {
      data: shallowRef({ data: [], meta: {} }),
      error: shallowRef(null),
      refresh: vi.fn()
    }
    const pendingCategories = deferred<typeof categoriesResult>()
    api.useAdminCategories.mockReturnValueOnce(pendingCategories.promise)

    const wrapper = await mountPageWithoutWaiting()

    expect(api.useAdminTags).toHaveBeenCalledOnce()

    pendingCategories.resolve(categoriesResult)
    await flushPromises()
    wrapper.unmount()
  })

  it('adds a created category locally without refreshing the list', async () => {
    const refresh = vi.fn()
    api.useAdminCategories.mockResolvedValueOnce({ data: shallowRef({ data: [], meta: {} }), error: shallowRef(null), refresh })
    api.createCategory.mockResolvedValueOnce({
      data: { id: 'category-1', name: 'New category', slug: 'new-category', description: null, color: null, sortOrder: 0, isSystem: false, articleCount: 0 },
      meta: {}
    })
    const wrapper = await mountPage()

    await wrapper.get('[data-test="category-create"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="category-count"]').text()).toBe('1')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('moves a deleted category count into the system category locally', async () => {
    api.useAdminCategories.mockResolvedValueOnce({
      data: shallowRef({ data: [
        { id: 'system', name: '未分类', slug: 'uncategorized', description: null, color: null, sortOrder: 0, isSystem: true, articleCount: 2 },
        { id: 'category-1', name: 'Old', slug: 'old', description: null, color: null, sortOrder: 1, isSystem: false, articleCount: 3 }
      ], meta: {} }), error: shallowRef(null), refresh: vi.fn()
    })
    api.deleteCategory.mockResolvedValueOnce({ data: { id: 'category-1' }, meta: {} })
    const wrapper = await mountPage()

    await wrapper.get('[data-test="category-remove"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="category-count"]').text()).toBe('1')
    expect(wrapper.get('[data-test="system-article-count"]').text()).toBe('5')
  })

  it('reports a synchronization warning without treating a completed tag merge as failed', async () => {
    api.mergeTags.mockResolvedValueOnce({ data: { sourceId: 'tag-1', targetId: 'tag-2' }, meta: {} })
    api.useAdminTags.mockResolvedValueOnce({
      data: shallowRef({ data: [
        { id: 'tag-1', name: 'One', slug: 'one', description: null, color: null, sortOrder: 0, articleCount: 1 },
        { id: 'tag-2', name: 'Two', slug: 'two', description: null, color: null, sortOrder: 1, articleCount: 1 }
      ], meta: {} }), error: shallowRef(null), refresh: vi.fn().mockRejectedValue(new Error('sync failed'))
    })
    const wrapper = await mountPage()

    await wrapper.get('[data-test="tag-merge"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="tag-manager-error"]').text()).toContain('标签已合并，但列表同步失败')
  })
})
