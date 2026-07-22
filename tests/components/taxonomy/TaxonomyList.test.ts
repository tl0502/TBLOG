import { mount } from '@vue/test-utils'
import TaxonomyList from '../../../components/taxonomy/TaxonomyList.vue'
import type { TaxonomyView } from '../../../types/public-view'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

const items: TaxonomyView[] = [
  { slug: 'engineering', name: 'Engineering', description: 'Build notes', color: null, articleCount: 4 },
  { slug: 'notes', name: 'Notes', description: null, color: null, articleCount: 2 }
]

describe('TaxonomyList', () => {
  it('renders each item with name, count, and a link under the base path', () => {
    const wrapper = mount(TaxonomyList, {
      props: { heading: 'Categories', items, basePath: '/categories' },
      global: { stubs: { NuxtLink } }
    })
    const text = wrapper.text()

    expect(text).toContain('Categories')
    expect(text).toContain('Engineering')
    expect(text).toContain('4')

    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toContain('/categories/engineering')
    expect(hrefs).toContain('/categories/notes')
  })

  it('shows an empty state with no items', () => {
    const wrapper = mount(TaxonomyList, {
      props: { heading: 'Tags', items: [], basePath: '/tags' },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.text()).toContain('暂无内容')
  })
})
