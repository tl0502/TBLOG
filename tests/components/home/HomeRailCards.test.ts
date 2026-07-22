import { mount } from '@vue/test-utils'
import HomeRailCards from '../../../components/home/HomeRailCards.vue'

const NuxtLink = { props: ['to'], template: '<a :href="to"><slot /></a>' }

describe('HomeRailCards', () => {
  it('renders enabled registered cards in configured order with card-specific settings', () => {
    const wrapper = mount(HomeRailCards, {
      props: {
        tags: [{ slug: 'nuxt', name: 'Nuxt' }],
        cards: [
          { instanceId: 'build-1', type: 'build-log', size: 'large', title: 'Shipping', entries: ['Release one'] },
          { instanceId: 'tags-1', type: 'tags', size: 'compact', title: 'Topics', collapsedCount: 1 }
        ]
      },
      global: { stubs: { NuxtLink } }
    })

    const cards = wrapper.findAll('.sidebar-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]?.text()).toContain('Shipping')
    expect(cards[0]?.text()).toContain('Release one')
    expect(cards[0]?.classes()).toContain('sidebar-card--large')
    expect(cards[1]?.text()).toContain('Topics')
    expect(cards[1]?.classes()).toContain('sidebar-card--compact')
  })

  it('renders an empty extension region when the public projection has no cards', () => {
    const wrapper = mount(HomeRailCards, {
      props: {
        tags: [],
        cards: []
      },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.find('.sidebar-card').exists()).toBe(false)
  })

  it('renders configured statistics and external navigation without decorative header icons', () => {
    const wrapper = mount(HomeRailCards, {
      props: {
        tags: [],
        cards: [
          { instanceId: 'stats-1', type: 'content-stats', size: 'normal', title: 'Overview', metrics: ['articles', 'pageViews'] },
          { instanceId: 'nav-1', type: 'navigation', size: 'normal', title: 'My sites', groups: [{
            label: 'Elsewhere', links: [{ label: 'Studio', url: 'https://studio.example.com', description: 'Other site', newTab: true }]
          }] }
        ],
        data: { cards: { 'stats-1': { contentStats: { articles: 12, categories: 3, tags: 8, pageViews: 4200 } } } }
      },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.text()).toContain('4,200')
    expect(wrapper.get('a[href="https://studio.example.com"]').attributes('target')).toBe('_blank')
    expect(wrapper.find('.icon').exists()).toBe(false)
  })

  it('renders multiple instances of the same card type with independent data', () => {
    const wrapper = mount(HomeRailCards, {
      props: {
        tags: [],
        cards: [
          { instanceId: 'stats-a', type: 'content-stats', size: 'normal', title: 'Writing', metrics: ['articles'] },
          { instanceId: 'stats-b', type: 'content-stats', size: 'normal', title: 'Traffic', metrics: ['pageViews'] }
        ],
        data: { cards: {
          'stats-a': { contentStats: { articles: 12, categories: 3, tags: 8, pageViews: 100 } },
          'stats-b': { contentStats: { articles: 12, categories: 3, tags: 8, pageViews: 4200 } }
        } }
      }
    })

    const cards = wrapper.findAll('.content-stats-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]?.text()).toContain('12')
    expect(cards[1]?.text()).toContain('4,200')
  })

  it('does not access reading progress storage while rendering a preview', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const wrapper = mount(HomeRailCards, {
      props: {
        preview: true,
        tags: [],
        cards: [{
          instanceId: 'series-1', type: 'reading-series', size: 'normal', title: 'Series',
          seriesTitle: 'Preview series', status: 'ongoing', showProgress: true,
          chapters: [{ title: 'One', url: '/posts/one', published: true }]
        }]
      },
      global: { stubs: { NuxtLink } }
    })

    await wrapper.get('.reading-series-card__chapter').trigger('click')

    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    getItem.mockRestore()
    setItem.mockRestore()
  })
})
