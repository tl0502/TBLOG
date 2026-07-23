import { mount } from '@vue/test-utils'
import { computed, shallowRef } from 'vue'

const api = vi.hoisted(() => ({
  useAdminSessionSnapshot: vi.fn(),
  useLazyAdminCommentCounts: vi.fn(),
  adminLogout: vi.fn()
}))
vi.mock('~/composables/useAdminApi', () => api)

const route = shallowRef({ path: '/admin/taxonomy' })
const dashboardData = shallowRef(null)
const loadCommentCount = vi.fn()

describe('admin layout', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('useRoute', () => computed(() => route.value).value)
    vi.stubGlobal('useNuxtData', () => ({ data: dashboardData }))
    vi.stubGlobal('navigateTo', vi.fn())
    api.useAdminSessionSnapshot.mockReturnValue(shallowRef({
      administrator: { username: 'editor' }, permissions: []
    }))
    api.useLazyAdminCommentCounts.mockReturnValue({ data: shallowRef({
      data: { pending: 6 }, meta: {}
    }), execute: loadCommentCount })
    dashboardData.value = null
    loadCommentCount.mockReset()
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['/admin/taxonomy', '分类与标签'],
    ['/admin/comments', '评论'],
    ['/admin/home-cards', '首页卡片'],
    ['/admin/profile', '个人资料']
  ])('marks %s active and forwards the pending count', async (path, label) => {
    route.value = { path }
    const Layout = (await import('../../layouts/admin.vue')).default
    const wrapper = mount(Layout, {
      slots: { default: '<p>Page</p>' },
      global: { stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } }
    })

    expect(wrapper.get('.admin-sidebar__link--active').text()).toContain(label)
    expect(wrapper.text()).toContain('editor')
    expect(wrapper.get('[data-test="pending-comments-count"]').text()).toBe('6')
  })

  it('reuses Dashboard metrics without starting the duplicate comment-count request', async () => {
    route.value = { path: '/admin' }
    dashboardData.value = { data: { pendingComments: 7 }, meta: {} } as never
    const Layout = (await import('../../layouts/admin.vue')).default
    const wrapper = mount(Layout, {
      slots: { default: '<p>Page</p>' },
      global: { stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } }
    })

    expect(wrapper.get('[data-test="pending-comments-count"]').text()).toBe('7')
    expect(loadCommentCount).not.toHaveBeenCalled()
  })
})
