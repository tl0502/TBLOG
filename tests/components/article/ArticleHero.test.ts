import { mount } from '@vue/test-utils'
import ArticleHero from '../../../components/article/ArticleHero.vue'
import type { PostDetailView } from '../../../types/public-view'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

const post: PostDetailView = {
  id: 'post-1',
  slug: 'hero-post',
  title: 'A Hero Post',
  type: 'article',
  cover: 'https://img.example.com/cover.jpg',
  excerpt: 'A deliberate article summary.',
  readingTime: 6,
  publishedAt: '2026-07-17T00:00:00.000Z',
  category: { slug: 'design', name: 'Design' },
  tags: [{ slug: 'layout', name: 'Layout' }],
  html: '<p>Body</p>',
  tocJson: null,
  codeMeta: [],
  seoTitle: null,
  seoDescription: null,
  canonicalUrlOverride: null,
  openGraphImageUrl: null,
  twitterImageUrl: null,
  jsonLdOverrideJson: null
}

function mountHero(
  overrides: Partial<PostDetailView> = {},
  coverUrl: string | null = post.cover,
  pageViews: number | null = null
) {
  return mount(ArticleHero, {
    props: {
      post: { ...post, ...overrides },
      publishedDate: '2026年7月17日',
      coverUrl,
      coverSrcset: coverUrl ? `${coverUrl} 960w` : null,
      pageViews
    },
    global: { stubs: { NuxtLink } }
  })
}

describe('ArticleHero', () => {
  it('overlays the title, metadata, category, and tags without repeating the excerpt', () => {
    const wrapper = mountHero()

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.get('h1').text()).toBe('A Hero Post')
    expect(wrapper.text()).not.toContain('A deliberate article summary.')
    expect(wrapper.find('.article-hero__excerpt').exists()).toBe(false)
    expect(wrapper.text()).toContain('2026年7月17日')
    expect(wrapper.text()).toContain('6 min read')
    expect(wrapper.get('.article-hero__image').attributes('src')).toBe(post.cover)
    expect(wrapper.findAll('a').map((link) => link.attributes('href'))).toEqual([
      '/categories/design',
      '/tags/layout'
    ])
  })

  it('uses the themed fallback without rendering a duplicate image', () => {
    const wrapper = mountHero({ cover: null, excerpt: null }, null)

    expect(wrapper.find('.article-hero__image').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('article-hero--with-cover')
    expect(wrapper.find('.article-hero__excerpt').exists()).toBe(false)
    expect(wrapper.findAll('h1')).toHaveLength(1)
  })

  it('renders article page views without a public report update label', () => {
    const wrapper = mountHero({}, post.cover, 42)

    expect(wrapper.text()).toContain('42 PV')
    expect(wrapper.text()).not.toContain('统计更新于')
  })
})
