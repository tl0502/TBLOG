import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, shallowRef } from 'vue'

const api = vi.hoisted(() => ({
  apiErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
  deletePost: vi.fn(),
  updatePost: vi.fn(),
  useLazyAdminIntegrations: vi.fn(),
  useAdminPosts: vi.fn(),
  useAdminTaxonomyOptions: vi.fn()
}))

vi.mock('~/composables/useAdminApi', () => api)

const PostListTable = defineComponent({
  name: 'PostListTable',
  props: {
    posts: { type: Array, required: true },
    tags: { type: Array, required: true },
    categories: { type: Array, required: true },
    pendingIds: { type: Array, required: true },
  },
  emits: ['delete', 'feature', 'publish', 'unpublish', 'category', 'tags', 'bulkPublish', 'bulkCategory', 'bulkTag', 'bulkFeatured'],
  template: `<div data-test="post-list-table">
    <span data-test="post-count">{{ posts.length }}</span>
    <span data-test="first-featured">{{ posts[0]?.featured }}</span>
    <button data-test="stub-feature" @click="$emit('feature', posts[0].id, true)">Feature</button>
    <button data-test="stub-delete" @click="$emit('delete', posts[0].id)">Delete</button>
    <button data-test="stub-publish" @click="$emit('publish', posts[0].id)">Publish</button>
    <button data-test="stub-unpublish" @click="$emit('unpublish', posts[0].id)">Unpublish</button>
    <button data-test="stub-category" @click="$emit('category', { id: posts[0].id, categoryId: 'category-2' })">Category</button>
    <button data-test="stub-tags" @click="$emit('tags', { id: posts[0].id, tagIds: ['tag-2'] })">Tags</button>
    <button data-test="stub-bulk-publish" @click="$emit('bulkPublish', [posts[0].id])">Bulk publish</button>
    <button data-test="stub-bulk-category" @click="$emit('bulkCategory', { ids: [posts[0].id], categoryId: 'category-2' })">Bulk category</button>
    <button data-test="stub-bulk-tag" @click="$emit('bulkTag', { ids: [posts[0].id], tagId: 'tag-2', mode: 'add' })">Bulk tag</button>
    <button data-test="stub-bulk-feature" @click="$emit('bulkFeatured', { ids: [posts[0].id], featured: true })">Bulk feature</button>
  </div>`
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function mountPageWithoutWaiting() {
  const Page = (await import('../../pages/admin/posts/index.vue')).default
  const Host = defineComponent({
    components: { Page },
    template: '<Suspense><Page /></Suspense>'
  })
  return mount(Host, { global: { stubs: { PostListTable, NuxtLink: true } } })
}

async function mountPage() {
  const wrapper = await mountPageWithoutWaiting()
  await flushPromises()
  return wrapper
}

describe('admin posts page', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('confirm', vi.fn(() => true))
    api.useAdminPosts.mockResolvedValue({
      data: shallowRef({
        data: [{ id: 'post-1', slug: 'hello', title: 'Hello', type: 'article' }],
        meta: { total: 1, offset: 0, limit: 25 }
      }),
      error: shallowRef(null),
      pending: shallowRef(false),
      refresh: vi.fn()
    })
    api.useAdminTaxonomyOptions.mockResolvedValue({
      data: shallowRef({ data: { categories: [], tags: [] }, meta: {} })
    })
    api.useLazyAdminIntegrations.mockReturnValue({
      data: shallowRef({ data: [], meta: {} }),
      refresh: vi.fn()
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('renders the post list without a legacy analytics dependency', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('[data-test="article-analytics-warning"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="post-count"]').text()).toBe('1')
  })

  it('creates the taxonomy and deferred integration reads before the posts read resolves', async () => {
    const postsResult = {
      data: shallowRef({ data: [], meta: { total: 0, offset: 0, limit: 25 } }),
      error: shallowRef(null),
      pending: shallowRef(false),
      refresh: vi.fn()
    }
    const pendingPosts = deferred<typeof postsResult>()
    api.useAdminPosts.mockReturnValueOnce(pendingPosts.promise)

    const wrapper = await mountPageWithoutWaiting()

    expect(api.useAdminTaxonomyOptions).toHaveBeenCalledOnce()
    expect(api.useLazyAdminIntegrations).toHaveBeenCalledOnce()

    pendingPosts.resolve(postsResult)
    await flushPromises()
    wrapper.unmount()
  })

  it('updates featured state locally without refreshing the post list', async () => {
    const refresh = vi.fn()
    api.useAdminPosts.mockResolvedValueOnce({
      data: shallowRef({ data: [{ id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'published', featured: false, updatedAt: '2026-07-20', publishedAt: '2026-07-20', tagIds: [] }], meta: { total: 1, offset: 0, limit: 25 } }),
      error: shallowRef(null), pending: shallowRef(false), refresh
    })
    api.updatePost.mockResolvedValueOnce({ data: { id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'published', featured: true, updatedAt: '2026-07-20', publishedAt: '2026-07-20', tagIds: [] }, meta: {} })
    const wrapper = await mountPage()

    await wrapper.get('[data-test="stub-feature"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="first-featured"]').text()).toBe('true')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('removes a deleted post locally without refreshing when the catalogue is empty', async () => {
    const refresh = vi.fn()
    api.useAdminPosts.mockResolvedValueOnce({
      data: shallowRef({ data: [{ id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'draft', featured: false, updatedAt: '2026-07-20', publishedAt: null, tagIds: [] }], meta: { total: 1, offset: 0, limit: 25 } }),
      error: shallowRef(null), pending: shallowRef(false), refresh
    })
    api.deletePost.mockResolvedValueOnce({ data: { id: 'post-1' }, meta: {} })
    const wrapper = await mountPage()

    await wrapper.get('[data-test="stub-delete"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="post-count"]').text()).toBe('0')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refetches when deleting the last row on a page that still has more matches', async () => {
    const refresh = vi.fn()
    api.useAdminPosts.mockResolvedValueOnce({
      data: shallowRef({
        data: [{ id: 'post-26', slug: 'tail', title: 'Tail', type: 'article', status: 'draft', featured: false, updatedAt: '2026-07-20', publishedAt: null, tagIds: [] }],
        meta: { total: 26, offset: 25, limit: 25 }
      }),
      error: shallowRef(null),
      pending: shallowRef(false),
      refresh
    })
    api.deletePost.mockResolvedValueOnce({ data: { id: 'post-26' }, meta: {} })
    const wrapper = await mountPage()

    await wrapper.get('[data-test="stub-delete"]').trigger('click')
    await flushPromises()

    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not report a successful delete as failed when integration refresh rejects', async () => {
    api.useLazyAdminIntegrations.mockReturnValueOnce({ data: shallowRef({ data: [], meta: {} }), refresh: vi.fn().mockRejectedValue(new Error('refresh failed')) })
    api.deletePost.mockResolvedValueOnce({ data: { id: 'post-1' }, meta: {} })
    const wrapper = await mountPage()

    await wrapper.get('[data-test="stub-delete"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.admin-alert').exists()).toBe(false)
  })

  it('publishes and updates taxonomy through the existing patch endpoint', async () => {
    api.updatePost
      .mockResolvedValueOnce({ data: { id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'published', featured: false, updatedAt: '2026-07-20', publishedAt: '2026-07-20', categoryId: 'category-1', tagIds: [] }, meta: {} })
      .mockResolvedValueOnce({ data: { id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'published', featured: false, updatedAt: '2026-07-20', publishedAt: '2026-07-20', categoryId: 'category-2', tagIds: [] }, meta: {} })
      .mockResolvedValueOnce({ data: { id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'published', featured: false, updatedAt: '2026-07-20', publishedAt: '2026-07-20', categoryId: 'category-2', tagIds: ['tag-2'] }, meta: {} })
      .mockResolvedValueOnce({ data: { id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'published', featured: true, updatedAt: '2026-07-20', publishedAt: '2026-07-20', categoryId: 'category-2', tagIds: ['tag-2'] }, meta: {} })
    const wrapper = await mountPage()

    await wrapper.get('[data-test="stub-publish"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="stub-category"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="stub-tags"]').trigger('click')
    await flushPromises()

    expect(api.updatePost).toHaveBeenNthCalledWith(1, 'post-1', { status: 'published' })
    expect(api.updatePost).toHaveBeenNthCalledWith(2, 'post-1', { categoryId: 'category-2' })
    expect(api.updatePost).toHaveBeenNthCalledWith(3, 'post-1', { tagIds: ['tag-2'] })
  })

  it('toggles a published article back to draft', async () => {
    api.updatePost.mockResolvedValueOnce({ data: { id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'draft', featured: false, updatedAt: '2026-07-20', publishedAt: '2026-07-20', categoryId: 'category-1', tagIds: [] }, meta: {} })
    const wrapper = await mountPage()
    await wrapper.get('[data-test="stub-unpublish"]').trigger('click')
    await flushPromises()
    expect(api.updatePost).toHaveBeenCalledWith('post-1', { status: 'draft' })
  })

  it('runs bounded batch publish, category, and tag changes through serial PATCH calls', async () => {
    api.useAdminPosts.mockResolvedValueOnce({
      data: shallowRef({ data: [{ id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'draft', featured: false, updatedAt: '2026-07-20', publishedAt: null, categoryId: 'category-1', tagIds: [] }], meta: { total: 1, offset: 0, limit: 25 } }),
      error: shallowRef(null), pending: shallowRef(false), refresh: vi.fn()
    })
    api.updatePost
      .mockResolvedValueOnce({ data: { id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'published', featured: false, updatedAt: '2026-07-20', publishedAt: '2026-07-20', categoryId: 'category-1', tagIds: [] }, meta: {} })
      .mockResolvedValueOnce({ data: { id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'published', featured: false, updatedAt: '2026-07-20', publishedAt: '2026-07-20', categoryId: 'category-2', tagIds: [] }, meta: {} })
      .mockResolvedValueOnce({ data: { id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'published', featured: false, updatedAt: '2026-07-20', publishedAt: '2026-07-20', categoryId: 'category-2', tagIds: ['tag-2'] }, meta: {} })
      .mockResolvedValueOnce({ data: { id: 'post-1', slug: 'hello', title: 'Hello', type: 'article', status: 'published', featured: true, updatedAt: '2026-07-20', publishedAt: '2026-07-20', categoryId: 'category-2', tagIds: ['tag-2'] }, meta: {} })
    const wrapper = await mountPage()

    await wrapper.get('[data-test="stub-bulk-publish"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="stub-bulk-category"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="stub-bulk-tag"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="stub-bulk-feature"]').trigger('click')
    await flushPromises()

    expect(api.updatePost).toHaveBeenNthCalledWith(1, 'post-1', { status: 'published' })
    expect(api.updatePost).toHaveBeenNthCalledWith(2, 'post-1', { categoryId: 'category-2' })
    expect(api.updatePost).toHaveBeenNthCalledWith(3, 'post-1', { tagIds: ['tag-2'] })
    expect(api.updatePost).toHaveBeenNthCalledWith(4, 'post-1', { featured: true })
    expect(wrapper.get('[data-test="post-action-notice"]').text()).toContain('成功 1')
  })
})
