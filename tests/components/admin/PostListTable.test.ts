import { mount } from '@vue/test-utils'
import PostListTable from '../../../components/admin/PostListTable.vue'
import type { AdminPostListItemView } from '../../../composables/useAdminApi'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

const posts: AdminPostListItemView[] = [
  {
    id: 'post-1',
    title: 'First Post',
    slug: 'first-post',
    type: 'article',
    status: 'draft',
    featured: false,
    updatedAt: '2026-06-20T12:00:00.000Z',
    publishedAt: null,
    categoryId: 'category-1',
    tagIds: ['tag-vue']
  },
  {
    id: 'post-2',
    title: 'About',
    slug: 'about',
    type: 'page',
    status: 'published',
    featured: true,
    updatedAt: '2026-06-21T12:00:00.000Z',
    publishedAt: '2026-06-21T12:00:00.000Z',
    categoryId: null,
    tagIds: []
  }
]

function mountTable(items = posts) {
  return mount(PostListTable, {
    props: { posts: items, tags: [{ id: 'tag-vue', name: 'Vue' }], categories: [{ id: 'category-1', name: 'Engineering' }, { id: 'category-2', name: 'Notes' }] },
    global: { stubs: { NuxtLink } }
  })
}

describe('PostListTable', () => {
  it('renders post rows with edit links and formatted dates', () => {
    const wrapper = mountTable()
    const text = wrapper.text()

    expect(text).toContain('First Post')
    expect(text).toContain('article')
    expect(text).toContain('草稿')
    expect(text).toContain('已发布')
    expect(text).toContain('2026年6月20日')

    const links = wrapper.findAll('a')
    expect(links.map((link) => link.attributes('href'))).toContain('/admin/posts/post-1')
    expect(links.map((link) => link.attributes('href'))).toContain('/admin/posts/post-2')
    expect(wrapper.find('.post-list__status--draft').exists()).toBe(true)
    expect(wrapper.find('.post-list__status--published').exists()).toBe(true)
  })

  it('emits delete with the post id', async () => {
    const wrapper = mountTable()

    await wrapper.get('[data-test="delete-post-1"]').trigger('click')

    expect(wrapper.emitted('delete')).toEqual([['post-1']])
  })

  it('renders an empty state when no posts exist', () => {
    const wrapper = mountTable([])

    expect(wrapper.text()).toContain('暂无文章')
  })

  it('emits server-side filter updates instead of filtering the local page client-side', async () => {
    const wrapper = mountTable()

    await wrapper.get('[data-test="post-search"]').setValue('first-post')
    await wrapper.get('[data-test="post-search"]').trigger('change')
    expect(wrapper.emitted('update:search')?.at(-1)).toEqual(['first-post'])
    // The page still shows every row the parent handed it until the server responds.
    expect(wrapper.text()).toContain('First Post')
    expect(wrapper.text()).toContain('About')

    await wrapper.get('[data-test="post-status-filter"]').setValue('published')
    expect(wrapper.emitted('update:status')?.at(-1)).toEqual(['published'])

    await wrapper.get('[data-test="post-tag-filter"]').setValue('tag-vue')
    expect(wrapper.emitted('update:tagId')?.at(-1)).toEqual(['tag-vue'])
  })

  it('shows pagination controls and emits page events when total exceeds the page size', async () => {
    const wrapper = mount(PostListTable, {
      props: {
        posts,
        tags: [{ id: 'tag-vue', name: 'Vue' }],
        categories: [],
        total: 30,
        offset: 0,
        limit: 25
      },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.get('[data-test="post-pagination"]').text()).toContain('1')
    expect(wrapper.get('[data-test="post-page-prev"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test="post-page-next"]').trigger('click')
    expect(wrapper.emitted('next')).toEqual([[]])
  })

  it('emits publish, category, and tag updates from row controls', async () => {
    const wrapper = mountTable()

    await wrapper.get('[data-test="publish-post-1"]').trigger('click')
    await wrapper.get('[data-test="publish-post-2"]').trigger('click')

    // Row menus keep their panel out of the DOM until opened, so disclose before touching controls.
    await wrapper.get('[data-test="category-post-1"]').trigger('click')
    await wrapper.get('[data-test="category-post-1-category-2"]').trigger('click')

    await wrapper.get('[data-test="tags-post-1"]').trigger('click')
    await wrapper.get('[data-test="tag-post-1-tag-vue"]').setValue(false)
    await wrapper.get('[data-test="save-tags-post-1"]').trigger('click')

    expect(wrapper.emitted('publish')).toEqual([['post-1']])
    expect(wrapper.emitted('unpublish')).toEqual([['post-2']])
    expect(wrapper.emitted('category')).toEqual([[{ id: 'post-1', categoryId: 'category-2' }]])
    expect(wrapper.emitted('tags')).toEqual([[{ id: 'post-1', tagIds: [] }]])
    // Saving closes the menu and resets the draft; reopening shows the tag re-checked from props.
    await wrapper.get('[data-test="tags-post-1"]').trigger('click')
    expect((wrapper.get('[data-test="tag-post-1-tag-vue"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('[data-test="category-post-2"]').attributes('aria-disabled')).toBe('true')
    expect(wrapper.find('[data-test="tag-post-2-tag-vue"]').exists()).toBe(false)
  })

  it('selects visible posts and emits bounded batch actions', async () => {
    const wrapper = mountTable()
    await wrapper.get('[data-test="select-post-1"]').setValue(true)
    await wrapper.get('[data-test="bulk-publish"]').trigger('click')
    await wrapper.find('.post-list__bulk label select').setValue('category-2')
    await wrapper.get('[data-test="bulk-category"]').trigger('click')

    expect(wrapper.emitted('bulkPublish')).toEqual([[['post-1']]])
    expect(wrapper.emitted('bulkCategory')).toEqual([[{ ids: ['post-1'], categoryId: 'category-2' }]])
  })

  it('keeps featured controls mounted and emits bulk featured changes', async () => {
    const wrapper = mountTable()
    expect(wrapper.get('[data-test="feature-post-1"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="feature-post-2"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.post-list__featured').text()).toBe('⭐')
  })

  it('limits select-visible batch selection to twenty posts', async () => {
    const many = Array.from({ length: 21 }, (_, index): AdminPostListItemView => ({
      ...posts[0], id: `post-${index + 1}`, title: `Post ${index + 1}`, slug: `post-${index + 1}`
    }))
    const wrapper = mountTable(many)
    await wrapper.get('[data-test="post-select-visible"]').setValue(true)

    expect(wrapper.get('[data-test="post-bulk-toolbar"]').text()).toContain('批量操作')
    expect(wrapper.get('[data-test="post-bulk-toolbar"]').text()).toContain('20/20')
  })

})
