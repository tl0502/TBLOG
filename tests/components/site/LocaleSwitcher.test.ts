import { mount } from '@vue/test-utils'
import LocaleSwitcher from '../../../components/site/LocaleSwitcher.vue'

describe('LocaleSwitcher', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens a compact icon menu with Simplified Chinese active by default', async () => {
    const wrapper = mount(LocaleSwitcher)

    const toggle = wrapper.get('[data-test="locale-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.find('svg').exists()).toBe(true)

    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(document.body.querySelector('[data-test="locale-zh-CN"]')?.getAttribute('aria-checked')).toBe('true')
    expect(document.body.querySelector('[data-test="locale-en-US"]')?.getAttribute('aria-checked')).toBe('false')
    expect(document.body.querySelector('.locale-switcher__menu')?.getAttribute('data-theme')).toBe('default')
  })

  it('switches the active language using accessible buttons', async () => {
    const wrapper = mount(LocaleSwitcher)

    await wrapper.get('[data-test="locale-toggle"]').trigger('click')

    const englishOptions = document.body.querySelectorAll<HTMLButtonElement>('[data-test="locale-en-US"]')
    const englishOption = englishOptions[englishOptions.length - 1]
    englishOption?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    englishOption?.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-test="locale-toggle"]').attributes('aria-expanded')).toBe('false')

    await wrapper.get('[data-test="locale-toggle"]').trigger('click')
    expect(document.body.querySelector('[data-test="locale-en-US"]')?.getAttribute('aria-checked')).toBe('true')
  })

  it('keeps the teleported menu inside the viewport when the trigger is near the left edge', async () => {
    const wrapper = mount(LocaleSwitcher)
    vi.spyOn(wrapper.get('.locale-switcher').element, 'getBoundingClientRect').mockReturnValue({
      top: 10, right: 42, bottom: 44, left: 10, width: 32, height: 34, x: 10, y: 10,
      toJSON: () => ({})
    })

    await wrapper.get('[data-test="locale-toggle"]').trigger('click')

    expect((document.body.querySelector('.locale-switcher__menu') as HTMLElement).style.left).toBe('8px')
  })
})
