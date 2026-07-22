import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import SettingsSeoForm from '../../../components/admin/SettingsSeoForm.vue'
import type { SeoSettings } from '../../../types/settings'

describe('SettingsSeoForm', () => {
  it('renders robots presets and the final metadata preview', async () => {
    const value = reactive<SeoSettings>({
      defaultTitle: 'My Blog',
      defaultDescription: 'Build notes',
      canonicalBaseUrl: 'https://example.com',
      rssEnabled: true,
      sitemapEnabled: true,
      robotsPolicy: 'index,follow'
    })
    const wrapper = mount(SettingsSeoForm, { props: { value, issues: [] } })

    expect(wrapper.get('[data-test="seo-robots"]').findAll('option')).toHaveLength(4)
    expect(wrapper.get('[data-test="seo-preview"]').text()).toContain('My Blog')
    expect(wrapper.get('[data-test="seo-preview"]').text()).toContain('https://example.com/')
    expect(wrapper.get('[data-test="seo-preview"]').text()).toContain('meta name="robots"')
  })
})
