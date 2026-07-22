import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import HomeFeedSortControl from '../../../components/home/HomeFeedSortControl.vue'

const NuxtLink = {
  name: 'NuxtLink',
  props: ['to'],
  template: '<a><slot /></a>'
}

describe('HomeFeedSortControl', () => {
  it('offers the three metrics and preserves direction when selecting one', () => {
    const wrapper = mount(HomeFeedSortControl, {
      props: { sort: 'publishedAt', order: 'desc', statisticsAvailable: true },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.text()).toContain('发布时间')
    expect(wrapper.text()).toContain('阅读量')
    expect(wrapper.text()).toContain('更新时间')

    const links = wrapper.findAllComponents(NuxtLink)
    const pageViews = links.find((link) => link.text() === '阅读量')
    expect(pageViews?.props('to')).toEqual({
      path: '/', query: { sort: 'pageViews', order: 'desc', page: '1' }, hash: '#articles'
    })
  })

  it('renders one direction toggle with solid active and muted inactive arrows', () => {
    const wrapper = mount(HomeFeedSortControl, {
      props: { sort: 'pageViews', order: 'asc' },
      global: { stubs: { NuxtLink } }
    })

    const toggle = wrapper.findAllComponents(NuxtLink)
      .find((link) => link.classes().includes('home-feed-sort__direction-toggle'))
    expect(toggle).toBeDefined()
    const arrows = toggle!.findAll('span')
    expect(toggle!.props('to')).toEqual({
      path: '/', query: { sort: 'pageViews', order: 'desc', page: '1' }, hash: '#articles'
    })
    expect(arrows[0].classes()).toContain('is-active')
    expect(arrows[1].classes()).not.toContain('is-active')
  })

  it('exposes an accessible popup and closes it on Escape or outside pointer input', async () => {
    const wrapper = mount(HomeFeedSortControl, {
      props: { sort: 'publishedAt', order: 'desc' },
      attachTo: document.body,
      global: { stubs: { NuxtLink } }
    })
    const button = wrapper.get('.home-feed-sort__trigger')
    const menu = wrapper.get('[role="menu"]')

    expect(button.attributes('aria-controls')).toBe(menu.attributes('id'))
    expect(button.attributes('aria-haspopup')).toBe('menu')

    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('true')
    await wrapper.get('.home-feed-sort').trigger('keydown', { key: 'Escape' })
    expect(button.attributes('aria-expanded')).toBe('false')

    await button.trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(button.attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })
})
