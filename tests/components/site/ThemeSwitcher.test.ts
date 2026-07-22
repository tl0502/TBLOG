import { mount } from '@vue/test-utils'
import ThemeSwitcher from '../../../components/site/ThemeSwitcher.vue'

describe('ThemeSwitcher', () => {
  it('cycles system, light, and dark modes without exposing administrator light-theme choices', async () => {
    const wrapper = mount(ThemeSwitcher)
    const toggle = wrapper.get('[data-test="theme-toggle"]')

    expect(toggle.attributes('data-color-mode')).toBe('system')
    expect(toggle.attributes('data-resolved-color-mode')).toBe('light')
    expect(toggle.attributes('aria-label')).toContain('亮色')
    expect(toggle.find('svg').exists()).toBe(true)
    expect(wrapper.find('[data-test="theme-atelier"]').exists()).toBe(false)

    await toggle.trigger('click')

    expect(toggle.attributes('data-color-mode')).toBe('light')
    expect(toggle.attributes('aria-label')).toContain('暗色')

    await toggle.trigger('click')

    expect(toggle.attributes('data-color-mode')).toBe('dark')
    expect(toggle.attributes('aria-label')).toContain('跟随系统')

    await toggle.trigger('click')

    expect(toggle.attributes('data-color-mode')).toBe('system')
  })
})
