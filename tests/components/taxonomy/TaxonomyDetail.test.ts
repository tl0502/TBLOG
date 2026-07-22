import { mount } from '@vue/test-utils'
import TaxonomyDetail from '../../../components/taxonomy/TaxonomyDetail.vue'
import type { ArticleListItemView } from '../../../types/public-view'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

const articles: ArticleListItemView[] = [
  {
    id: '1',
    slug: 'first',
    title: 'First Article',
    cover: null,
    excerpt: 'x',
    readingTime: 3,
    publishedAt: '2026-06-20T00:00:00.000Z',
    category: { slug: 'engineering', name: 'Engineering' },
    tags: []
  }
]

describe('TaxonomyDetail', () => {
  it('renders the kind, name, description, and the article feed', () => {
    const wrapper = mount(TaxonomyDetail, {
      props: { kind: 'Category', name: 'Engineering', description: 'Build notes', articles },
      global: { stubs: { NuxtLink } }
    })
    const text = wrapper.text()

    expect(text).toContain('Category')
    expect(text).toContain('Engineering')
    expect(text).toContain('Build notes')
    expect(text).toContain('First Article')
  })

  it('shows an empty state when there are no articles', () => {
    const wrapper = mount(TaxonomyDetail, {
      props: { kind: 'Tag', name: 'Vue', articles: [] },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.text()).toContain('该tag下暂无文章')
  })

  it('emits load-more once and disables the action while loading', async () => {
    const wrapper = mount(TaxonomyDetail, {
      props: { kind: 'Tag', name: 'Vue', articles, hasMore: true, loadingMore: true },
      global: { stubs: { NuxtLink } }
    })

    const button = wrapper.get('button')
    expect(button.attributes('disabled')).toBeDefined()
    await wrapper.setProps({ loadingMore: false })
    await button.trigger('click')
    expect(wrapper.emitted('loadMore')).toEqual([[]])
  })
})
