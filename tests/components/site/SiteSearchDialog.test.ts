import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SiteSearchDialog from '../../../components/site/SiteSearchDialog.vue'

const search = vi.hoisted(() => ({
  searchAlgolia: vi.fn(),
  MAX_SEARCH_QUERY_LENGTH: 300
}))

vi.mock('~/composables/usePublicSearch', () => search)

const NuxtLink = {
  props: ['to'],
  template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>'
}

function mountDialog() {
  return mount(SiteSearchDialog, {
    props: {
      enabled: true,
      config: { appId: 'APP', searchOnlyKey: 'KEY', indexName: 'posts' }
    },
    global: { stubs: { NuxtLink, Teleport: true } }
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  search.searchAlgolia.mockResolvedValue({
    hits: [{
      objectID: '1', title: 'Cloudflare Search', slug: 'cloudflare-search', excerpt: 'Search intro',
      category: null, tags: []
    }],
    error: false,
    nbHits: 1,
    page: 0,
    nbPages: 1
  })
})

describe('SiteSearchDialog', () => {
  it('opens from the header and renders quick Algolia results', async () => {
    const wrapper = mountDialog()
    const trigger = wrapper.get('.site-search__trigger')
    expect(trigger.text()).toBe('')
    await trigger.trigger('click')
    const field = wrapper.get('.site-search__field input')
    expect(field.attributes('type')).toBe('text')
    expect(wrapper.get('.site-search__backdrop').attributes('data-theme')).toBe('default')
    expect(wrapper.find('.site-search__close svg').exists()).toBe(true)
    await field.setValue('cloudflare')
    await new Promise((resolve) => setTimeout(resolve, 240))
    await nextTick()

    expect(search.searchAlgolia).toHaveBeenCalledWith(
      { appId: 'APP', searchOnlyKey: 'KEY', indexName: 'posts' },
      'cloudflare',
      expect.any(AbortSignal),
      { hitsPerPage: 5 }
    )
    expect(wrapper.text()).toContain('Cloudflare Search')
    expect(wrapper.get('.site-search__result').attributes('href')).toBe('/posts/cloudflare-search')
    expect(wrapper.get('.site-search__all').attributes('href')).toBe('/search')
  })

  it('opens with the global Control+K shortcut', async () => {
    const wrapper = mountDialog()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    await nextTick()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
