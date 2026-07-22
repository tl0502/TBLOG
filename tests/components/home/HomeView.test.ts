import { mount } from '@vue/test-utils'
import HomeView from '../../../components/home/HomeView.vue'
import type { ArticleListItemView, TagView } from '../../../types/public-view'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

const feed: ArticleListItemView[] = [
  {
    id: '1',
    slug: 'pinned-post',
    title: 'Pinned Post',
    cover: null,
    excerpt: 'The first item is pinned.',
    readingTime: 5,
    publishedAt: '2026-06-20T00:00:00.000Z',
    category: null,
    tags: []
  },
  {
    id: '2',
    slug: 'second-post',
    title: 'Second Post',
    cover: null,
    excerpt: 'A later article.',
    readingTime: 3,
    publishedAt: '2026-06-10T00:00:00.000Z',
    category: null,
    tags: [{ slug: 'vue', name: 'Vue' }]
  }
]

const tags: TagView[] = [
  { slug: 'vue', name: 'Vue' },
  { slug: 'nuxt', name: 'Nuxt' }
]

describe('HomeView', () => {
  it('renders the pinned first item, the full feed, and the sidebar cards', () => {
    const wrapper = mount(HomeView, { props: { feed, tags }, global: { stubs: { NuxtLink } } })
    const text = wrapper.text()

    expect(text).toContain('Pinned Post')
    expect(text).toContain('Second Post')
    expect(wrapper.get('.home-intro-card__count').text()).toContain('01 / 01')
    expect(wrapper.findAll('.article-card')).toHaveLength(2)
    expect(text).toContain('Tags')
    expect(text).toContain('Build Log')
  })

  it('uses the selected featured article and renders hotspot statistics beside it', () => {
    const wrapper = mount(HomeView, {
      props: {
        feed,
        featured: [feed[1]],
        tags,
        hotspots: {
          current: [{ article: feed[0], pageViews: 42, trend: 'up', fallback: false }],
          historical: [{ article: feed[1], pageViews: 120, fallback: false }]
        },
        feedMeta: {
          page: 1,
          pageSize: 25,
          total: 2,
          pageCount: 1,
          sort: 'publishedAt',
          order: 'desc',
          reportUpdatedAt: '2026-07-20T06:45:10.878Z'
        }
      },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.get('.hotspot-stats-card').text()).toContain('站内热点')
    expect(wrapper.get('.hotspot-stats-card__lead').text()).toContain('No.1')
    expect(wrapper.get('.hotspot-stats-card__lead').text()).toContain('42 次浏览')
    expect(wrapper.text()).not.toContain('统计更新于')
    expect(wrapper.findAll('.article-card')).toHaveLength(2)
    expect(wrapper.findAll('.article-card').map((card) => card.text())).toEqual(expect.arrayContaining([
      expect.stringContaining('Pinned Post'),
      expect.stringContaining('Second Post')
    ]))
  })

  it('limits the scrollable historical hotspot list to ten rows', () => {
    const historical = Array.from({ length: 12 }, (_, index) => ({
      article: { ...feed[0], id: `history-${index}`, slug: `history-${index}`, title: `History ${index}` },
      pageViews: 100 - index,
      fallback: false
    }))
    const wrapper = mount(HomeView, {
      props: {
        feed,
        tags,
        hotspots: {
          current: [
            { article: feed[0], pageViews: 42, trend: 'up', fallback: false },
            { article: feed[1], pageViews: 30, trend: 'steady', fallback: false },
            { article: { ...feed[1], id: '3', slug: 'third-post' }, pageViews: 20, trend: 'down', fallback: false }
          ],
          historical
        }
      },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.findAll('.hotspot-stats-card__tile b').map((item) => item.text())).toEqual(['No.2', 'No.3'])
    expect(wrapper.findAll('.hotspot-stats-card__row')).toHaveLength(10)
    expect(wrapper.find('.hotspot-stats-card__history-list').exists()).toBe(true)
  })

  it('shows an empty state when there is no feed', () => {
    const wrapper = mount(HomeView, { props: { feed: [], tags: [] }, global: { stubs: { NuxtLink } } })

    expect(wrapper.text()).toContain('暂无文章')
  })

  it('renders article sorting and numbered pagination metadata', () => {
    const wrapper = mount(HomeView, {
      props: {
        feed,
        tags,
        feedMeta: { page: 2, pageSize: 25, total: 60, pageCount: 3, sort: 'pageViews', order: 'desc' }
      },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.get('.home__feed-title').text()).toBe('文章')
    expect(wrapper.get('.home-feed-sort').text()).toContain('阅读量')
    expect(wrapper.findAll('.home-feed-pagination__pages a')).toHaveLength(3)
  })
})
