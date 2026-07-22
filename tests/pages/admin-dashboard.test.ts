import { mount } from '@vue/test-utils'
import { shallowRef } from 'vue'

const api = vi.hoisted(() => ({ useDashboardMetrics: vi.fn() }))
vi.mock('~/composables/useAdminApi', () => api)

describe('admin dashboard', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('definePageMeta', vi.fn())
    api.useDashboardMetrics.mockReturnValue({
      data: shallowRef({ data: {
        publishedArticles: 8, drafts: 2, categories: 3, tags: 5, pendingComments: 7
      }, meta: {} }),
      error: shallowRef(null)
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('renders the pending comments metric from dashboard data', async () => {
    const Page = (await import('../../pages/admin/index.vue')).default
    const wrapper = mount(Page)

    expect(wrapper.text()).toContain('待审核评论')
    expect(wrapper.text()).toContain('7')
  })
})
