import { mount } from '@vue/test-utils'
import AdminShell from '../../../components/admin/AdminShell.vue'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

function mountShell() {
  return mount(AdminShell, {
    props: { adminName: 'editor', activeKey: 'dashboard', pendingComments: 4 },
    slots: { default: '<p class="page">Dashboard content</p>' },
    global: { stubs: { NuxtLink } }
  })
}

describe('AdminShell', () => {
  it('renders the sidebar and the page slot', () => {
    const wrapper = mountShell()

    expect(wrapper.find('.admin-shell__sidebar').exists()).toBe(true)
    expect(wrapper.find('.page').text()).toBe('Dashboard content')
    expect(wrapper.get('[data-test="pending-comments-count"]').text()).toBe('4')
    expect(wrapper.get('.admin-shell').attributes('data-color-mode')).toBe('light')
    expect(wrapper.find('[data-test="theme-toggle"]').exists()).toBe(true)
  })

  it('toggles the mobile drawer from the menu button', async () => {
    const wrapper = mountShell()
    const menu = wrapper.find('.admin-shell__menu')

    expect(wrapper.find('.admin-shell--drawer-open').exists()).toBe(false)
    expect(menu.attributes('aria-expanded')).toBe('false')

    await menu.trigger('click')
    expect(wrapper.find('.admin-shell--drawer-open').exists()).toBe(true)
    expect(menu.attributes('aria-expanded')).toBe('true')

    await menu.trigger('click')
    expect(wrapper.find('.admin-shell--drawer-open').exists()).toBe(false)
  })

  it('forwards the sidebar sign-out event', async () => {
    const wrapper = mountShell()

    await wrapper.find('.admin-sidebar__signout').trigger('click')

    expect(wrapper.emitted('signOut')).toHaveLength(1)
  })
})
