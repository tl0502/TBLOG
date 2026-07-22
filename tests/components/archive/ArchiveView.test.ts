import { mount } from '@vue/test-utils'
import ArchiveView from '../../../components/archive/ArchiveView.vue'
import type { ArchiveGroupView } from '../../../types/public-view'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

const groups: ArchiveGroupView[] = [
  {
    year: 2026,
    month: 6,
    items: [
      {
        id: '1',
        slug: 'june-article',
        title: 'June Article',
        cover: null,
        excerpt: null,
        readingTime: 2,
        publishedAt: '2026-06-10T00:00:00.000Z',
        category: null,
        tags: []
      }
    ]
  },
  {
    year: 2026,
    month: 5,
    items: [
      {
        id: '2',
        slug: 'may-article',
        title: 'May Article',
        cover: null,
        excerpt: null,
        readingTime: 1,
        publishedAt: '2026-05-02T00:00:00.000Z',
        category: null,
        tags: []
      }
    ]
  }
]

describe('ArchiveView', () => {
  it('renders month/year headings and the articles in each group', () => {
    const wrapper = mount(ArchiveView, { props: { groups }, global: { stubs: { NuxtLink } } })
    const text = wrapper.text()

    expect(text).toContain('归档')
    expect(text).toContain('2026年6月')
    expect(text).toContain('June Article')
    expect(text).toContain('2026年5月')
    expect(text).toContain('May Article')
  })

  it('shows an empty state with no groups', () => {
    const wrapper = mount(ArchiveView, { props: { groups: [] }, global: { stubs: { NuxtLink } } })

    expect(wrapper.text()).toContain('暂无文章')
  })
})
