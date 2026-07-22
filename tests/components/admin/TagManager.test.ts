import { mount } from '@vue/test-utils'
import TagManager from '../../../components/admin/TagManager.vue'
import type { AdminTagView } from '../../../composables/useAdminApi'

function tagView(overrides: Partial<AdminTagView> = {}): AdminTagView {
  return {
    id: 't1',
    name: 'Tag',
    slug: 'tag',
    description: null,
    color: null,
    sortOrder: 0,
    articleCount: 0,
    ...overrides
  }
}

function mountManager(tags: AdminTagView[]) {
  return mount(TagManager, { props: { tags } })
}

describe('TagManager', () => {
  it('keeps the table inside its horizontal scroll container', () => {
    const wrapper = mountManager([tagView()])

    expect(wrapper.get('.taxonomy-table-scroll').find('.taxonomy-table').exists()).toBe(true)
  })

  it('emits create with the entered name and an omitted slug when blank', async () => {
    const wrapper = mountManager([])

    await wrapper.get('[data-test="tag-name"]').setValue('Cloudflare')
    await wrapper.get('.taxonomy-form').trigger('submit')

    expect(wrapper.emitted('create')).toEqual([[{ name: 'Cloudflare', slug: undefined, sortOrder: 0 }]])
  })

  it('emits remove for a tag', async () => {
    const wrapper = mountManager([tagView({ id: 't1' })])

    await wrapper.get('[data-test="tag-delete-t1"]').trigger('click')

    expect(wrapper.emitted('remove')).toEqual([['t1']])
  })

  it('loads a row into the form and emits update on save', async () => {
    const wrapper = mountManager([tagView({ id: 't1', name: 'Old', slug: 'old', sortOrder: 4 })])

    await wrapper.get('[data-test="tag-edit-t1"]').trigger('click')
    await wrapper.get('[data-test="tag-name"]').setValue('New')
    await wrapper.get('.taxonomy-form').trigger('submit')

    expect(wrapper.emitted('update')).toEqual([['t1', { name: 'New', slug: 'old', sortOrder: 4 }]])
  })

  it('emits merge with the chosen source and target', async () => {
    const wrapper = mountManager([tagView({ id: 'a', name: 'A', slug: 'a' }), tagView({ id: 'b', name: 'B', slug: 'b' })])

    await wrapper.get('[data-test="merge-source"]').setValue('a')
    await wrapper.get('[data-test="merge-target"]').setValue('b')
    await wrapper.get('.taxonomy-merge').trigger('submit')

    expect(wrapper.emitted('merge')).toEqual([['a', 'b']])
  })

  it('does not emit merge when source and target are the same tag', async () => {
    const wrapper = mountManager([tagView({ id: 'a', name: 'A', slug: 'a' })])

    await wrapper.get('[data-test="merge-source"]').setValue('a')
    await wrapper.get('[data-test="merge-target"]').setValue('a')
    await wrapper.get('.taxonomy-merge').trigger('submit')

    expect(wrapper.emitted('merge')).toBeUndefined()
  })

  it('keeps submitted input until the tag list confirms success', async () => {
    const wrapper = mountManager([])
    await wrapper.get('[data-test="tag-name"]').setValue('Cloudflare')
    await wrapper.get('.taxonomy-form').trigger('submit')

    expect((wrapper.get('[data-test="tag-name"]').element as HTMLInputElement).value).toBe('Cloudflare')
    await wrapper.setProps({ tags: [tagView({ name: 'Cloudflare' })] })
    expect((wrapper.get('[data-test="tag-name"]').element as HTMLInputElement).value).toBe('')
  })
})
