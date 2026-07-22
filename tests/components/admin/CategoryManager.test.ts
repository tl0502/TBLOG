import { mount } from '@vue/test-utils'
import CategoryManager from '../../../components/admin/CategoryManager.vue'
import type { AdminCategoryView } from '../../../composables/useAdminApi'

function categoryView(overrides: Partial<AdminCategoryView> = {}): AdminCategoryView {
  return {
    id: 'c1',
    name: 'Cat',
    slug: 'cat',
    description: null,
    color: null,
    sortOrder: 0,
    isSystem: false,
    articleCount: 0,
    ...overrides
  }
}

function mountManager(categories: AdminCategoryView[]) {
  return mount(CategoryManager, { props: { categories } })
}

describe('CategoryManager', () => {
  it('keeps the table inside its horizontal scroll container', () => {
    const wrapper = mountManager([categoryView()])

    expect(wrapper.get('.taxonomy-table-scroll').find('.taxonomy-table').exists()).toBe(true)
  })

  it('emits create with the entered name and an omitted slug when blank', async () => {
    const wrapper = mountManager([])

    await wrapper.get('[data-test="category-name"]').setValue('Engineering')
    await wrapper.get('.taxonomy-form').trigger('submit')

    expect(wrapper.emitted('create')).toEqual([[{ name: 'Engineering', slug: undefined, sortOrder: 0 }]])
  })

  it('disables delete for a system category and enables it otherwise', () => {
    const wrapper = mountManager([
      categoryView({ id: 'sys', name: '未分类', isSystem: true }),
      categoryView({ id: 'c1' })
    ])

    expect(wrapper.get('[data-test="category-delete-sys"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="category-delete-c1"]').attributes('disabled')).toBeUndefined()
  })

  it('emits remove for a deletable category', async () => {
    const wrapper = mountManager([categoryView({ id: 'c1' })])

    await wrapper.get('[data-test="category-delete-c1"]').trigger('click')

    expect(wrapper.emitted('remove')).toEqual([['c1']])
  })

  it('loads a row into the form and emits update on save', async () => {
    const wrapper = mountManager([categoryView({ id: 'c1', name: 'Old', slug: 'old', sortOrder: 2 })])

    await wrapper.get('[data-test="category-edit-c1"]').trigger('click')
    await wrapper.get('[data-test="category-name"]').setValue('New')
    await wrapper.get('.taxonomy-form').trigger('submit')

    expect(wrapper.emitted('update')).toEqual([['c1', { name: 'New', slug: 'old', sortOrder: 2 }]])
  })

  it('keeps submitted input until the category list confirms success', async () => {
    const wrapper = mountManager([])
    await wrapper.get('[data-test="category-name"]').setValue('Engineering')
    await wrapper.get('.taxonomy-form').trigger('submit')

    expect((wrapper.get('[data-test="category-name"]').element as HTMLInputElement).value).toBe('Engineering')
    await wrapper.setProps({ categories: [categoryView({ name: 'Engineering' })] })
    expect((wrapper.get('[data-test="category-name"]').element as HTMLInputElement).value).toBe('')
  })
})
