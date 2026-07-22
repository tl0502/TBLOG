import { mount } from '@vue/test-utils'
import MobileTocEntry from '../../../components/article/MobileTocEntry.vue'
import type { TocItemView } from '../../../types/public-view'

const toc: TocItemView[] = [
  { id: 'intro', depth: 2, text: 'Intro' },
  { id: 'details', depth: 3, text: 'Details' }
]

describe('MobileTocEntry', () => {
  it('opens and closes the drawer from the button', async () => {
    const wrapper = mount(MobileTocEntry, { props: { toc } })
    const button = wrapper.find('.mobile-toc__button')

    expect(wrapper.find('.mobile-toc__drawer').exists()).toBe(false)
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.attributes('aria-controls')).toBe('mobile-toc-drawer')

    await button.trigger('click')
    expect(wrapper.find('.mobile-toc__drawer').exists()).toBe(true)
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(wrapper.text()).toContain('Intro')

    await button.trigger('click')
    expect(wrapper.find('.mobile-toc__drawer').exists()).toBe(false)
  })

  it('closes the drawer when a toc link is followed', async () => {
    const wrapper = mount(MobileTocEntry, { props: { toc } })
    const button = wrapper.find('.mobile-toc__button')

    await button.trigger('click')
    expect(wrapper.find('.mobile-toc__drawer').exists()).toBe(true)

    await wrapper.find('.article-toc__link').trigger('click')
    expect(wrapper.find('.mobile-toc__drawer').exists()).toBe(false)
  })
})
