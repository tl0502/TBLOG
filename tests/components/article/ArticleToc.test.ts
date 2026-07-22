import { mount } from '@vue/test-utils'
import ArticleToc from '../../../components/article/ArticleToc.vue'
import type { TocItemView } from '../../../types/public-view'

const items: TocItemView[] = [
  { id: 'intro', depth: 2, text: 'Intro' },
  { id: 'details', depth: 3, text: 'Details' }
]

describe('ArticleToc', () => {
  it('renders heading anchors with depth classes', () => {
    const wrapper = mount(ArticleToc, { props: { items } })

    const links = wrapper.findAll('.article-toc__link')
    expect(links).toHaveLength(2)
    expect(links.map((link) => link.attributes('href'))).toEqual(['#intro', '#details'])
    expect(wrapper.find('.article-toc__item--h2').exists()).toBe(true)
    expect(wrapper.find('.article-toc__item--h3').exists()).toBe(true)
    expect(wrapper.text()).toContain('Intro')
    expect(wrapper.text()).toContain('Details')
  })

  it('emits navigate with the heading id on click', async () => {
    const wrapper = mount(ArticleToc, { props: { items } })

    await wrapper.find('.article-toc__link').trigger('click')

    expect(wrapper.emitted('navigate')?.[0]).toEqual(['intro'])
  })

  it('renders nothing when there are no items', () => {
    const wrapper = mount(ArticleToc, { props: { items: [] } })

    expect(wrapper.find('.article-toc').exists()).toBe(false)
  })
})
