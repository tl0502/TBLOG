import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AppHeader from '../../../components/site/AppHeader.vue'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

describe('AppHeader', () => {
  afterEach(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  })

  it('renders the site name and primary navigation', () => {
    const wrapper = mount(AppHeader, { global: { stubs: { NuxtLink, HeaderParticles: true } } })

    expect(wrapper.text()).toContain('TBLOG')
    expect(wrapper.find('.site-header__mark').exists()).toBe(true)
    expect(wrapper.find('.locale-switcher').exists()).toBe(true)
    expect(wrapper.find('.theme-switcher').exists()).toBe(true)
    const controls = wrapper.find('.site-header__nav-wrap').findAll('.theme-switcher, .locale-switcher')
    expect(controls.map(control => control.classes()[0])).toEqual(['theme-switcher', 'locale-switcher'])
    for (const label of ['首页', '分类', '归档', '关于']) {
      expect(wrapper.text()).toContain(label)
    }
    expect(wrapper.text()).not.toContain('标签')
  })

  it('accepts a custom site name', () => {
    const wrapper = mount(AppHeader, {
      props: { siteName: 'My Blog' },
      global: { stubs: { NuxtLink, HeaderParticles: true } }
    })

    expect(wrapper.text()).toContain('My Blog')
  })

  it('renders configured internal routes with NuxtLink and external URLs with safe anchors', () => {
    const wrapper = mount(AppHeader, {
      props: {
        navigation: [
          { label: 'Docs', href: '/docs' },
          { label: 'GitHub', href: 'https://github.com/example' }
        ]
      },
      global: { stubs: { NuxtLink, HeaderParticles: true } }
    })

    const links = wrapper.findAll('.site-header__link')
    expect(links[0]?.attributes('href')).toBe('/docs')
    expect(links[1]?.attributes()).toMatchObject({
      href: 'https://github.com/example',
      target: '_blank',
      rel: 'noopener noreferrer'
    })
    expect(wrapper.text()).not.toContain('分类')
  })

  it('does not mutate configured navigation when exposing the search launcher', () => {
    const navigation = [{ label: 'Docs', href: '/docs' }]
    const originalNavigation = navigation.map((item) => ({ ...item }))

    const wrapper = mount(AppHeader, {
      props: {
        navigation,
        searchEnabled: true,
        searchConfig: { appId: 'APP', searchOnlyKey: 'KEY', indexName: 'posts' }
      },
      global: { stubs: { NuxtLink, HeaderParticles: true, Teleport: true } }
    })

    expect(navigation).toEqual(originalNavigation)
    expect(wrapper.findAll('.site-header__link').map((link) => link.attributes('href'))).toEqual(['/docs'])
    expect(wrapper.find('.site-search__trigger').exists()).toBe(true)
    expect(wrapper.get('.site-header__nav-wrap').element.firstElementChild?.classList.contains('site-search')).toBe(true)
  })

  it('removes a configured search link while the search integration is disabled', () => {
    const wrapper = mount(AppHeader, {
      props: {
        navigation: [
          { label: 'Search', href: '/search' },
          { label: 'Archive', href: '/archive' }
        ],
        searchEnabled: false
      },
      global: { stubs: { NuxtLink, HeaderParticles: true } }
    })

    expect(wrapper.findAll('.site-header__link').map((link) => link.attributes('href'))).toEqual([
      '/archive'
    ])
  })

  it('keeps the tag index out of configured header navigation', () => {
    const wrapper = mount(AppHeader, {
      props: { navigation: [{ label: 'Topics', href: '/tags' }, { label: 'Notes', href: '/archive' }] },
      global: { stubs: { NuxtLink, HeaderParticles: true } }
    })

    expect(wrapper.findAll('.site-header__link').map(link => link.attributes('href'))).toEqual(['/archive'])
  })

  it('supports an image logo with a configurable letter fallback', async () => {
    const wrapper = mount(AppHeader, {
      props: { siteName: 'My Blog', logoUrl: 'https://example.com/logo.png', logoLetter: 'M' },
      global: { stubs: { NuxtLink, HeaderParticles: true } }
    })

    expect(wrapper.get('.site-header__mark-image').attributes('src')).toBe('https://example.com/logo.png')

    await wrapper.get('.site-header__mark-image').trigger('error')

    expect(wrapper.find('.site-header__mark-image').exists()).toBe(false)
    expect(wrapper.get('.site-header__mark-letter').text()).toBe('M')
    expect(wrapper.get('.site-header__wordmark').text()).toBe('My Blog')
  })

  it('adds the stronger glass state after the page scrolls', async () => {
    const wrapper = mount(AppHeader, { global: { stubs: { NuxtLink, HeaderParticles: true } } })

    expect(wrapper.get('.site-header').classes()).not.toContain('site-header--scrolled')

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 24 })
    window.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(wrapper.get('.site-header').classes()).toContain('site-header--scrolled')
    wrapper.unmount()
  })

  it('uses normal document flow and disables the scroll state when sticky is false', async () => {
    const wrapper = mount(AppHeader, {
      props: { sticky: false },
      global: { stubs: { NuxtLink, HeaderParticles: true } }
    })

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 24 })
    window.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(wrapper.get('.site-header').classes()).toContain('site-header--static')
    expect(wrapper.get('.site-header').classes()).not.toContain('site-header--scrolled')
  })
})
