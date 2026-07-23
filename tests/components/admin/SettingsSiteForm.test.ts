import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import SettingsSiteForm from '../../../components/admin/SettingsSiteForm.vue'
import type { SettingsValidationIssue, SiteSettings } from '../../../composables/useAdminApi'

function siteValue(overrides: Partial<SiteSettings> = {}): SiteSettings {
  return reactive({
    siteName: 'TBLOG',
    description: null,
    logoUrl: null,
    faviconUrl: null,
    featuredFallbackCover: null,
    lightTheme: 'default',
    navigation: [],
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    socialLinks: [],
    ...overrides
  })
}

function mountForm(value: SiteSettings, issues: SettingsValidationIssue[] = []) {
  return mount(SettingsSiteForm, { props: { value, issues } })
}

describe('SettingsSiteForm', () => {
  it('adds and removes navigation rows on the shared model object', async () => {
    const value = siteValue()
    const wrapper = mountForm(value)

    await wrapper.get('[data-test="nav-add"]').trigger('click')
    expect(value.navigation).toHaveLength(1)

    await wrapper.get('[data-test="nav-label-0"]').setValue('Home')
    await wrapper.get('[data-test="nav-href-0"]').setValue('/')
    expect(value.navigation[0]).toEqual({ label: 'Home', href: '/' })

    await wrapper.get('[data-test="nav-remove-0"]').trigger('click')
    expect(value.navigation).toHaveLength(0)
  })

  it('adds and removes social links on the shared model object', async () => {
    const value = siteValue()
    const wrapper = mountForm(value)

    await wrapper.get('[data-test="social-add"]').trigger('click')
    await wrapper.get('[data-test="social-platform-0"]').setValue('github')
    await wrapper.get('[data-test="social-url-0"]').setValue('https://github.com/x')
    expect(value.socialLinks[0]).toEqual({ platform: 'github', url: 'https://github.com/x' })

    await wrapper.get('[data-test="social-remove-0"]').trigger('click')
    expect(value.socialLinks).toHaveLength(0)
  })

  it('edits scalar fields directly on the model', async () => {
    const value = siteValue()
    const wrapper = mountForm(value)

    await wrapper.get('[data-test="site-name"]').setValue('New name')
    expect(value.siteName).toBe('New name')

    await wrapper.get('[data-test="site-favicon"]').setValue('https://cdn.example/favicon.ico')
    expect(value.faviconUrl).toBe('https://cdn.example/favicon.ico')
    await wrapper.get('[data-test="site-favicon"]').setValue('  ')
    expect(value.faviconUrl).toBeNull()
  })

  it('lets administrators select Atelier without exposing Nocturne as a site setting', async () => {
    const value = siteValue()
    const wrapper = mountForm(value)

    const select = wrapper.get('[data-test="site-light-theme"]')
    expect(select.findAll('option').map(option => option.attributes('value'))).toEqual(['default', 'atelier'])

    await select.setValue('atelier')

    expect(value.lightTheme).toBe('atelier')
    expect(wrapper.text()).toContain('暗色模式固定使用 Nocturne')
  })

  it('renders the server field error for the matching path', () => {
    const wrapper = mountForm(siteValue({ siteName: '' }), [
      { path: ['siteName'], message: 'Site name is required' }
    ])

    expect(wrapper.get('[data-test="site-name-error"]').text()).toBe('Site name is required')
  })
})
