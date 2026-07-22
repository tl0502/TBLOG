import { mount } from '@vue/test-utils'
import ArticleAssistRail from '../../../components/article/ArticleAssistRail.vue'
import type { TagView, TocItemView } from '../../../types/public-view'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

const toc: TocItemView[] = [
  { id: 'intro', depth: 2, text: 'Intro' },
  { id: 'details', depth: 3, text: 'Details' }
]

const tags: TagView[] = [
  { slug: 'vue', name: 'Vue' },
  { slug: 'nuxt', name: 'Nuxt' }
]

function mountRail(open = true) {
  return mount(ArticleAssistRail, {
    props: { toc, publishedAt: '2026-06-01T00:00:00.000Z', readingTime: 5, tags, open },
    global: { stubs: { NuxtLink } }
  })
}

describe('ArticleAssistRail', () => {
  it('renders toc, date, reading time, and tag links when open', () => {
    const wrapper = mountRail(true)
    const text = wrapper.text()

    expect(text).toContain('Intro')
    expect(text).toContain('Details')
    expect(text).toContain('2026年6月1日')
    expect(text).toContain('5 分钟阅读')

    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toContain('/tags/vue')
    expect(hrefs).toContain('/tags/nuxt')
  })

  it('is collapsed (not open) when closed', () => {
    const wrapper = mountRail(false)

    expect(wrapper.find('.assist-rail').classes()).not.toContain('assist-rail--open')
  })

  it('keeps article metadata visible and explains when there are no section headings', () => {
    const wrapper = mount(ArticleAssistRail, {
      props: { toc: [], publishedAt: '2026-06-01T00:00:00.000Z', readingTime: 5, tags, open: true },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.text()).toContain('2026年6月1日')
    expect(wrapper.text()).toContain('本文没有章节标题。')
  })
})
