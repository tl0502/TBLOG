import { mount } from '@vue/test-utils'
import SettingsProfileForm from '../../../components/admin/SettingsProfileForm.vue'
import type { ProfileSettings } from '../../../composables/useAdminApi'

function profile(): ProfileSettings {
  return {
    name: 'Tian',
    role: 'Builder · Writer',
    avatarUrl: null,
    shortBio: '记录值得长期保留的思考。',
    signature: '把复杂系统整理成可被理解的作品。',
    introduction: '我在这里记录构建过程和判断。',
    topics: ['Content Systems'],
    currentStatus: '正在构建 TBLOG',
    location: 'Shanghai',
    socialLinks: [],
    projects: [],
    journeyEnabled: false,
    journey: []
  }
}

describe('SettingsProfileForm', () => {
  it('exposes one save action for each profile section', async () => {
    const wrapper = mount(SettingsProfileForm, { props: { value: profile(), issues: [] } })
    const sections = ['identity', 'introduction', 'social', 'projects', 'journey']

    for (const section of sections) {
      await wrapper.get(`[data-test="profile-save-${section}"]`).trigger('click')
    }

    expect(wrapper.emitted('save')?.map(args => args[0])).toEqual(sections)
  })

  it('reports field and structural edits for the affected section', async () => {
    const wrapper = mount(SettingsProfileForm, { props: { value: profile(), issues: [] } })

    await wrapper.get('[data-test="profile-name"]').setValue('Edited')
    await wrapper.get('[data-test="profile-add-social"]').trigger('click')
    await wrapper.get('[data-test="profile-add-project"]').trigger('click')

    expect(wrapper.emitted('edit')?.map(args => args[0])).toEqual(['identity', 'social', 'projects'])
  })

  it('adds structured public links and projects with visibility/order defaults', async () => {
    const value = profile()
    const wrapper = mount(SettingsProfileForm, { props: { value, issues: [] } })

    await wrapper.get('[data-test="profile-add-social"]').trigger('click')
    await wrapper.get('[data-test="profile-add-project"]').trigger('click')

    expect(value.socialLinks).toEqual([{ platform: '', url: '', visible: true, sortOrder: 0 }])
    expect(value.projects).toEqual([expect.objectContaining({ visible: true, sortOrder: 0, tags: [] })])
  })

  it('keeps journey optional and only exposes entry controls when enabled', async () => {
    const value = profile()
    const wrapper = mount(SettingsProfileForm, { props: { value, issues: [] } })

    expect(wrapper.find('[data-test="profile-add-journey"]').exists()).toBe(false)
    await wrapper.get('[data-test="profile-journey-enabled"]').setValue(true)
    await wrapper.get('[data-test="profile-add-journey"]').trigger('click')

    expect(value.journeyEnabled).toBe(true)
    expect(value.journey).toEqual([expect.objectContaining({ visible: true, sortOrder: 0 })])
  })

  it('previews current unsaved values in all three public states', async () => {
    const value = profile()
    value.name = 'Unsaved author'
    value.socialLinks = [
      { platform: 'GitHub', url: 'https://github.com/visible', visible: true, sortOrder: 1 },
      { platform: 'Hidden', url: 'https://example.com/hidden', visible: false, sortOrder: 0 }
    ]
    const wrapper = mount(SettingsProfileForm, { props: { value, issues: [] }, attachTo: document.body })

    await wrapper.get('[data-test="profile-open-preview"]').trigger('click')
    expect(document.body.querySelector('.profile-preview__public-card .personal-card__name')?.textContent).toBe('Unsaved author')

    const popover = document.body.querySelector('[data-test="profile-preview-popover"]') as HTMLButtonElement
    popover.click()
    await wrapper.vm.$nextTick()
    const publicPopover = document.body.querySelector('.profile-preview__public-card--popover .profile-preview')
    expect(publicPopover?.getAttribute('aria-hidden')).toBe('false')
    expect(publicPopover?.querySelector('.profile-preview__name')?.textContent).toBe('Unsaved author')
    expect(publicPopover?.querySelector('.profile-preview__topics')?.textContent).toContain('Content Systems')
    expect(publicPopover?.querySelector('[aria-label="GitHub"]')).not.toBeNull()
    expect(publicPopover?.querySelector('[aria-label="Hidden"]')).toBeNull()

    const detail = document.body.querySelector('[data-test="profile-preview-detail"]') as HTMLButtonElement
    detail.click()
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('把复杂系统整理成可被理解的作品。')

    wrapper.unmount()
  })
})
