import { mount } from '@vue/test-utils'
import CommentModerationTable from '../../../components/admin/CommentModerationTable.vue'
import type { AdminCommentView } from '../../../composables/useAdminApi'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

function commentView(overrides: Partial<AdminCommentView> = {}): AdminCommentView {
  return {
    id: 'comment-1',
    nickname: 'Reader',
    email: 'reader@example.com',
    content: '<strong>plain text</strong>\nsecond line',
    status: 'pending',
    createdAt: '2026-07-11T08:00:00.000Z',
    reviewedAt: null,
    post: { id: 'post-1', slug: 'hello-world', title: 'Hello World' },
    ...overrides
  }
}

function mountTable(rows: AdminCommentView[], pendingIds: string[] = []) {
  return mount(CommentModerationTable, {
    props: { rows, pendingIds },
    global: { stubs: { NuxtLink } }
  })
}

describe('CommentModerationTable', () => {
  it('shows private email, article link, status, and escaped plain-text content', () => {
    const wrapper = mountTable([commentView()])

    expect(wrapper.text()).toContain('reader@example.com')
    expect(wrapper.text()).toContain('待审核')
    expect(wrapper.get('[data-test="comment-article-comment-1"]').attributes('href')).toBe('/posts/hello-world')
    expect(wrapper.get('[data-test="comment-content-comment-1"]').html()).not.toContain('<strong>plain text</strong>')
    expect(wrapper.get('[data-test="comment-content-comment-1"]').text()).toContain('<strong>plain text</strong>')
    expect(wrapper.findAll('th').every((header) => header.attributes('scope') === 'col')).toBe(true)
  })

  it('renders moderation timestamps in explicit UTC for SSR hydration stability', () => {
    const wrapper = mountTable([commentView({ reviewedAt: '2026-07-11T09:30:00.000Z' })])

    expect(wrapper.text()).toContain('提交于 2026年7月11日 UTC 08:00')
    expect(wrapper.text()).toContain('审核于 2026年7月11日 UTC 09:30')
  })

  it('shows the parent nickname and content when moderating a reply', () => {
    const wrapper = mountTable([commentView({
      parentCommentId: 'parent-1',
      parent: { id: 'parent-1', nickname: 'Original reader', content: 'Original context', status: 'approved' }
    })])
    expect(wrapper.get('.comment-ledger__parent-context').text()).toContain('Original reader')
    expect(wrapper.get('.comment-ledger__parent-context').text()).toContain('Original context')
  })

  it('shows status-dependent moderation actions and always shows delete', () => {
    const wrapper = mountTable([
      commentView({ id: 'pending', status: 'pending' }),
      commentView({ id: 'approved', status: 'approved' }),
      commentView({ id: 'rejected', status: 'rejected' })
    ])

    expect(wrapper.find('[data-test="comment-approve-pending"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="comment-reject-pending"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="comment-approve-approved"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="comment-reject-approved"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="comment-approve-rejected"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="comment-reject-rejected"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test^="comment-delete-"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-test^="comment-auto-moderate-"]')).toHaveLength(3)
    expect(wrapper.find('.comment-ledger__status--pending').exists()).toBe(true)
    expect(wrapper.find('.comment-ledger__status--approved').exists()).toBe(true)
    expect(wrapper.find('.comment-ledger__status--rejected').exists()).toBe(true)
  })

  it('emits row actions and disables a row while its action is pending', async () => {
    const wrapper = mountTable([commentView()], ['comment-1'])

    for (const action of ['approve', 'reject', 'delete'] as const) {
      const button = wrapper.get(`[data-test="comment-${action}-comment-1"]`)
      expect(button.attributes('disabled')).toBeDefined()
    }

    await wrapper.setProps({ pendingIds: [] })
    await wrapper.get('[data-test="comment-approve-comment-1"]').trigger('click')
    await wrapper.get('[data-test="comment-reject-comment-1"]').trigger('click')
    await wrapper.get('[data-test="comment-delete-comment-1"]').trigger('click')
    await wrapper.get('[data-test="comment-auto-moderate-comment-1"]').trigger('click')

    expect(wrapper.emitted('approve')).toEqual([['comment-1']])
    expect(wrapper.emitted('reject')).toEqual([['comment-1']])
    expect(wrapper.emitted('delete')).toEqual([['comment-1']])
    expect(wrapper.emitted('autoModerate')).toEqual([['comment-1']])
  })

  it('emits row and page selection changes', async () => {
    const wrapper = mountTable([commentView(), commentView({ id: 'comment-2' })])

    await wrapper.get('[data-test="comment-select-comment-1"]').setValue(true)
    await wrapper.get('[data-test="comment-select-page"]').setValue(true)

    expect(wrapper.emitted('toggleSelection')).toEqual([['comment-1', true]])
    expect(wrapper.emitted('togglePage')).toEqual([[true]])
  })

  it('locks only queued rows while preserving their action labels', () => {
    const wrapper = mountTable([
      commentView({ id: 'comment-1' }),
      commentView({ id: 'comment-2' })
    ], ['comment-1'])

    expect(wrapper.get('[data-test="comment-approve-comment-1"]').text()).toBe('提交中…')
    expect(wrapper.get('[data-test="comment-approve-comment-1"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="comment-approve-comment-2"]').attributes('disabled')).toBeUndefined()
  })
})
