import { mount } from '@vue/test-utils'
import CommentPagination from '../../../components/admin/CommentPagination.vue'

describe('CommentPagination', () => {
  it('disables previous at the start and next at the end', async () => {
    const wrapper = mount(CommentPagination, { props: { total: 41, offset: 0, limit: 20 } })

    expect(wrapper.get('[data-test="comment-page-prev"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="comment-page-next"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('第 1–20 条，共 41 条')

    await wrapper.setProps({ offset: 40 })
    expect(wrapper.get('[data-test="comment-page-prev"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-test="comment-page-next"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('第 41–41 条，共 41 条')
  })

  it('emits prev and next when the respective bound allows it', async () => {
    const wrapper = mount(CommentPagination, { props: { total: 60, offset: 20, limit: 20 } })

    await wrapper.get('[data-test="comment-page-prev"]').trigger('click')
    await wrapper.get('[data-test="comment-page-next"]').trigger('click')

    expect(wrapper.emitted('prev')).toHaveLength(1)
    expect(wrapper.emitted('next')).toHaveLength(1)
  })

  it('never displays an inverted range while an out-of-range offset is reconciling', () => {
    const wrapper = mount(CommentPagination, { props: { total: 40, offset: 60, limit: 20 } })

    expect(wrapper.text()).toContain('第 40–40 条，共 40 条')
  })
})
