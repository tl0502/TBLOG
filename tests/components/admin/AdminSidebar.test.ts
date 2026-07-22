import { mount } from '@vue/test-utils'
import AdminSidebar from '../../../components/admin/AdminSidebar.vue'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

function mountSidebar(props: { adminName: string; activeKey?: string; pendingComments?: number }) {
  return mount(AdminSidebar, { props, global: { stubs: { NuxtLink } } })
}

describe('AdminSidebar', () => {
  it('renders the nav, the admin name, and marks Dashboard active', () => {
    const wrapper = mountSidebar({ adminName: 'editor', activeKey: 'dashboard' })
    const text = wrapper.text()

    for (const label of ['仪表盘', '文章', '个人资料', '关于页面', '分类与标签', '评论', '首页卡片', '设置']) {
      expect(text).toContain(label)
    }
    expect(text).toContain('editor')

    const active = wrapper.find('.admin-sidebar__link--active')
    expect(active.text()).toContain('仪表盘')
    expect(active.attributes('href')).toBe('/admin')
    expect(active.attributes('aria-current')).toBe('page')
  })

  it('links every primary admin area and keeps integrations inside Settings', () => {
    const wrapper = mountSidebar({ adminName: 'editor', activeKey: 'posts' })

    const links = wrapper.findAll('a').map((link) => link.text())
    expect(links.some((t) => t.includes('访问分析'))).toBe(false)
    expect(links.some((t) => t.includes('文章'))).toBe(true)
    expect(links.some((t) => t.includes('关于页面'))).toBe(true)
    expect(links.some((t) => t.includes('分类与标签'))).toBe(true)
    expect(links.some((t) => t.includes('评论'))).toBe(true)

    const postsLink = wrapper.findAll('a').find((link) => link.text().includes('文章'))
    expect(postsLink?.attributes('href')).toBe('/admin/posts')
    const profileLink = wrapper.findAll('a').find((link) => link.text().includes('个人资料'))
    expect(profileLink?.attributes('href')).toBe('/admin/profile')
    const taxonomyLink = wrapper.findAll('a').find((link) => link.text().includes('分类与标签'))
    expect(taxonomyLink?.attributes('href')).toBe('/admin/taxonomy')
    const commentsLink = wrapper.findAll('a').find((link) => link.text().includes('评论'))
    expect(commentsLink?.attributes('href')).toBe('/admin/comments')
    const homeCardsLink = wrapper.findAll('a').find((link) => link.text().includes('首页卡片'))
    expect(homeCardsLink?.attributes('href')).toBe('/admin/home-cards')
    const settingsLink = wrapper.findAll('a').find((link) => link.text().includes('设置'))
    expect(settingsLink?.attributes('href')).toBe('/admin/settings')
    expect(wrapper.findAll('a').some((link) => link.attributes('href') === '/admin/integrations')).toBe(false)

    expect(wrapper.findAll('.admin-sidebar__link--disabled')).toHaveLength(0)
  })

  it('shows the pending badge only for a positive count', async () => {
    const wrapper = mountSidebar({ adminName: 'editor', pendingComments: 3 })

    expect(wrapper.get('[data-test="pending-comments-count"]').text()).toBe('3')
    await wrapper.setProps({ pendingComments: 0 })
    expect(wrapper.find('[data-test="pending-comments-count"]').exists()).toBe(false)
  })

  it('emits signOut when the sign-out button is clicked', async () => {
    const wrapper = mountSidebar({ adminName: 'editor' })

    await wrapper.find('.admin-sidebar__signout').trigger('click')

    expect(wrapper.emitted('signOut')).toHaveLength(1)
  })
})
