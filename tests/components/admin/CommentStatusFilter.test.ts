import { mount } from '@vue/test-utils'
import CommentStatusFilter from '../../../components/admin/CommentStatusFilter.vue'

describe('CommentStatusFilter', () => {
  it('marks the selected status and emits each typed filter value', async () => {
    const wrapper = mount(CommentStatusFilter, { props: { status: 'pending' } })

    expect(wrapper.get('[data-test="comment-filter-pending"]').attributes('aria-pressed')).toBe('true')

    for (const status of ['all', 'approved', 'rejected'] as const) {
      await wrapper.get(`[data-test="comment-filter-${status}"]`).trigger('click')
    }

    expect(wrapper.emitted('change')).toEqual([['all'], ['approved'], ['rejected']])
  })
})
