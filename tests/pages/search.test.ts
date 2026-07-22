import { mount } from '@vue/test-utils'
import { nextTick, reactive, shallowRef } from 'vue'
import type { SearchHit } from '../../composables/usePublicSearch'

const search = vi.hoisted(() => ({
  useSearchConfigState: vi.fn(),
  searchAlgolia: vi.fn(),
  MAX_SEARCH_QUERY_LENGTH: 300
}))

vi.mock('~/composables/usePublicSearch', () => search)

vi.stubGlobal('useHead', vi.fn())

const route = reactive({ query: {} as Record<string, string | undefined> })
const router = { replace: vi.fn(), push: vi.fn() }

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

function mockConfig(data: {
  enabled: boolean
  provider: string | null
  config: { appId: string; searchOnlyKey: string; indexName: string } | null
}) {
  search.useSearchConfigState.mockReturnValue({
    data: shallowRef({ data, meta: {} }),
    status: shallowRef('success')
  })
}

async function mountPage() {
  const page = await import('../../pages/search.vue')
  return mount(page.default, { global: { stubs: { NuxtLink } } })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => router)
  for (const key of Object.keys(route.query)) delete route.query[key]
})

describe('search page', () => {
  it('shows the disabled placeholder and never renders an input when search is off', async () => {
    mockConfig({ enabled: false, provider: null, config: null })

    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('搜索未启用')
    expect(wrapper.find('.search__input').exists()).toBe(false)
    expect(search.searchAlgolia).not.toHaveBeenCalled()
  })

  it('renders result links for the returned hits when search is enabled', async () => {
    mockConfig({
      enabled: true,
      provider: 'algolia',
      config: { appId: 'APP', searchOnlyKey: 'KEY', indexName: 'idx' }
    })

    const hits: SearchHit[] = [
      {
        objectID: '1',
        title: 'Hello Nuxt',
        slug: 'hello-nuxt',
        excerpt: 'An intro to Nuxt.',
        category: { slug: 'web', name: 'Web' },
        tags: [{ slug: 'nuxt', name: 'Nuxt' }]
      }
    ]
    search.searchAlgolia.mockResolvedValue({ hits, error: false, nbHits: 1, page: 0, nbPages: 1 })

    const wrapper = await mountPage()

    const input = wrapper.get('.search__input')
    await input.setValue('nuxt')

    // Wait out the 250ms debounce, then flush the resolved search promise.
    await new Promise((resolve) => setTimeout(resolve, 300))
    await nextTick()

    expect(search.searchAlgolia).toHaveBeenCalledWith(
      { appId: 'APP', searchOnlyKey: 'KEY', indexName: 'idx' },
      'nuxt',
      expect.any(AbortSignal),
      { page: 0, hitsPerPage: 20 }
    )

    expect(input.attributes('maxlength')).toBe('300')

    const link = wrapper.get('.search-result__link')
    expect(link.text()).toContain('Hello Nuxt')
    expect(link.attributes('href')).toBe('/posts/hello-nuxt')
    expect(wrapper.text()).toContain('An intro to Nuxt.')
    expect(wrapper.text()).toContain('Nuxt')
    expect(wrapper.text()).toContain('找到 1 篇文章')
    expect(router.replace).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.objectContaining({ q: 'nuxt' })
    }))
  })

  it('loads a shareable URL query and exposes bounded pagination', async () => {
    route.query.q = 'cloudflare'
    route.query.page = '2'
    mockConfig({
      enabled: true,
      provider: 'algolia',
      config: { appId: 'APP', searchOnlyKey: 'KEY', indexName: 'idx' }
    })
    search.searchAlgolia.mockResolvedValue({
      hits: [], error: false, nbHits: 45, page: 1, nbPages: 3
    })

    const wrapper = await mountPage()
    await new Promise((resolve) => setTimeout(resolve, 300))
    await nextTick()

    expect((wrapper.get('.search__input').element as HTMLInputElement).value).toBe('cloudflare')
    expect(search.searchAlgolia).toHaveBeenCalledWith(
      { appId: 'APP', searchOnlyKey: 'KEY', indexName: 'idx' },
      'cloudflare',
      expect.any(AbortSignal),
      { page: 1, hitsPerPage: 20 }
    )
    expect(wrapper.text()).toContain('第 2 / 3 页')

    await wrapper.findAll('.search__pagination button')[1]!.trigger('click')
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.objectContaining({ q: 'cloudflare', page: '3' })
    }))
  })
})
