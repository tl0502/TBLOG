import { mount } from '@vue/test-utils'
import AppFooter from '../../../components/site/AppFooter.vue'

describe('AppFooter', () => {
  it('renders the configured brand and social links', () => {
    const wrapper = mount(AppFooter, {
      props: {
        siteName: 'My Blog',
        socialLinks: [{ platform: 'GitHub', url: 'https://github.com/example' }]
      }
    })

    expect(wrapper.text()).toContain('© My Blog')
    expect(wrapper.get('.site-footer__social-link').attributes()).toMatchObject({
      href: 'https://github.com/example',
      target: '_blank',
      rel: 'noopener noreferrer'
    })
  })
})
