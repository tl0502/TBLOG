import { mount } from '@vue/test-utils'
import AssistRailHandle from '../../../components/article/AssistRailHandle.vue'

describe('AssistRailHandle', () => {
  it('uses a native accessible button linked to the assist rail', () => {
    const wrapper = mount(AssistRailHandle, { props: { open: false } })
    const handle = wrapper.get('.assist-handle')

    expect(handle.element.tagName).toBe('BUTTON')
    expect(handle.attributes('type')).toBe('button')
    expect(handle.attributes('aria-controls')).toBe('article-assist-rail')
    expect(handle.attributes('aria-label')).toBe('打开目录')
    expect(handle.attributes('aria-expanded')).toBe('false')
  })

  it('updates only its accessible open state without rendering an active hint', async () => {
    const wrapper = mount(AssistRailHandle, { props: { open: false } })

    await wrapper.setProps({ open: true })

    expect(wrapper.get('.assist-handle').attributes('aria-label')).toBe('关闭目录')
    expect(wrapper.get('.assist-handle').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.assist-handle--active').exists()).toBe(false)
    expect(wrapper.find('.assist-handle__hint').exists()).toBe(false)
  })

  it('renders one capsule grip and emits toggle on activation', async () => {
    const wrapper = mount(AssistRailHandle, { props: { open: false } })

    expect(wrapper.findAll('.assist-handle__grip')).toHaveLength(1)
    await wrapper.get('.assist-handle').trigger('click')

    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })
})
