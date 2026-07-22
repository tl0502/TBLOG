import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BackToTopButton from '../../../components/site/BackToTopButton.vue'

describe('BackToTopButton', () => {
  it('appears after scrolling and returns smoothly to the top', async () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 600 })
    window.matchMedia = vi.fn(() => ({ matches: false })) as never
    window.scrollTo = vi.fn()

    const wrapper = mount(BackToTopButton, { global: { stubs: { Transition: false } } })
    await nextTick()

    await wrapper.get('button').trigger('click')
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('moves above the footer when it enters the viewport', async () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 600 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })

    const footer = document.createElement('footer')
    footer.className = 'site-footer'
    footer.getBoundingClientRect = vi.fn(() => ({ top: 700 })) as never
    document.body.appendChild(footer)

    const wrapper = mount(BackToTopButton, { global: { stubs: { Transition: false } } })
    await nextTick()

    expect(wrapper.get('button').attributes('style')).toContain('bottom: 112px')

    wrapper.unmount()
    footer.remove()
  })
})
