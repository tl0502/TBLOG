import { mount } from '@vue/test-utils'
import ArticleCard from '../../../components/article/ArticleCard.vue'
import type { ArticleListItemView } from '../../../types/public-view'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

const article: ArticleListItemView = {
  id: 'a',
  slug: 'hello-world',
  title: 'Hello World',
  cover: null,
  excerpt: 'An introduction',
  readingTime: 4,
  publishedAt: '2026-06-01T00:00:00.000Z',
  category: { slug: 'cat1', name: 'Cat One' },
  tags: [
    { slug: 'vue', name: 'Vue' },
    { slug: 'nuxt', name: 'Nuxt' }
  ]
}

function mountCard(overrides: Partial<ArticleListItemView> = {}) {
  return mount(ArticleCard, {
    props: { article: { ...article, ...overrides } },
    global: { stubs: { NuxtLink } }
  })
}

describe('ArticleCard', () => {
  it('renders title, excerpt, date, reading time, and tag links', () => {
    const wrapper = mountCard()
    const text = wrapper.text()

    expect(text).toContain('Hello World')
    expect(text).toContain('An introduction')
    expect(text).toContain('2026年6月1日')
    expect(text).toContain('4 分钟阅读')
    expect(text).toContain('Vue')

    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toContain('/posts/hello-world')
    expect(hrefs).toContain('/tags/vue')
    expect(hrefs).toContain('/tags/nuxt')
  })

  it('never renders a comment count or admin state', () => {
    const wrapper = mountCard()
    const text = wrapper.text().toLowerCase()

    expect(text).not.toContain('comment')
    expect(text).not.toContain('draft')
  })

  it('omits the excerpt block when there is no excerpt', () => {
    const wrapper = mountCard({ excerpt: null })

    expect(wrapper.find('.article-card__excerpt').exists()).toBe(false)
  })

  it('keeps the media column for articles with and without covers', () => {
    const withoutCover = mountCard()
    const withCover = mountCard({ cover: 'https://images.example/cover.jpg' })

    expect(withoutCover.classes()).toContain('article-card--without-cover')
    expect(withoutCover.find('.article-card__media').exists()).toBe(true)
    expect(withoutCover.get('.article-card__placeholder').text()).toBe('H')
    expect(withCover.classes()).toContain('article-card--with-cover')
    expect(withCover.find('.article-card__media').exists()).toBe(true)
    expect(withCover.get('.article-card__image').attributes('src')).toBe('https://images.example/cover.jpg')
  })

  it('renders only visible tag links and summarizes additional tags', () => {
    const wrapper = mountCard({
      tags: [
        { slug: 'vue', name: 'Vue' },
        { slug: 'nuxt', name: 'Nuxt' },
        { slug: 'cloudflare', name: 'Cloudflare' },
        { slug: 'architecture', name: 'Architecture' }
      ]
    })

    expect(wrapper.findAll('.article-card__tags a').map((tag) => tag.text())).toEqual(['Vue', 'Nuxt'])
    expect(wrapper.get('.article-card__tag-more').text()).toBe('+2')
    expect(wrapper.get('.article-card__tag-more').attributes('aria-label')).toBe('Cloudflare、Architecture')
  })

  it('keeps an emoji intact in the no-cover placeholder', () => {
    const wrapper = mountCard({ title: '🧪 Experiment' })

    expect(wrapper.get('.article-card__placeholder').text()).toBe('🧪')
  })
})
