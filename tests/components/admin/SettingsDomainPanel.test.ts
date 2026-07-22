import { flushPromises, mount } from '@vue/test-utils'
import SettingsDomainPanel from '../../../components/admin/SettingsDomainPanel.vue'
import SettingsProfileForm from '../../../components/admin/SettingsProfileForm.vue'
import type { ProfileSettings, SeoSettings } from '../../../composables/useAdminApi'

const api = vi.hoisted(() => ({
  apiErrorCode: vi.fn((error: unknown) => (error as { data?: { error?: { code?: string } } })?.data?.error?.code ?? null),
  fetchSettingsDomain: vi.fn(),
  updateSettingsDomain: vi.fn(),
  settingsValidationIssues: vi.fn(() => [] as unknown[]),
  settingsIssueMessage: vi.fn((issues: { path: (string | number)[]; message: string }[], path: (string | number)[]) => {
    const hit = issues.find((issue) => path.every((seg, index) => issue.path[index] === seg))
    return hit?.message ?? ''
  }),
  apiErrorMessage: vi.fn((error: unknown, fallback: string) => {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    return message || fallback
  })
}))

vi.mock('~/composables/useAdminApi', () => api)

function seo(overrides: Partial<SeoSettings> = {}): SeoSettings {
  return {
    defaultTitle: null,
    defaultDescription: null,
    canonicalBaseUrl: null,
    rssEnabled: true,
    sitemapEnabled: true,
    robotsPolicy: 'index,follow',
    ...overrides
  }
}

function profile(): ProfileSettings {
  return {
    name: 'Tian',
    role: 'Builder',
    avatarUrl: null,
    shortBio: 'Short bio',
    signature: 'Saved signature',
    introduction: 'Saved introduction',
    topics: ['Systems'],
    currentStatus: 'Building',
    location: null,
    socialLinks: [],
    projects: [],
    journeyEnabled: false,
    journey: []
  }
}

const stubs = {
  SettingsSiteForm: true,
  SettingsHomeForm: true,
  SettingsProfileForm: true,
  SettingsCommentForm: true,
  SettingsMediaForm: true,
  SettingsSecurityView: true
}

function mountPanel(domain = 'seo') {
  return mount(SettingsDomainPanel, { props: { domain: domain as never }, global: { stubs } })
}

describe('SettingsDomainPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('refreshNuxtData', vi.fn().mockResolvedValue(undefined))
    api.apiErrorCode.mockImplementation(
      (error: unknown) => (error as { data?: { error?: { code?: string } } })?.data?.error?.code ?? null
    )
    api.settingsValidationIssues.mockReturnValue([])
    api.settingsIssueMessage.mockImplementation(
      (issues: { path: (string | number)[]; message: string }[], path: (string | number)[]) => {
        const hit = issues.find((issue) => path.every((seg, index) => issue.path[index] === seg))
        return hit?.message ?? ''
      }
    )
    api.apiErrorMessage.mockImplementation((error: unknown, fallback: string) => {
      const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
      return message || fallback
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('loads the domain settings and shows the save control', async () => {
    api.fetchSettingsDomain.mockResolvedValue({ data: seo(), meta: { domain: 'seo' } })
    const wrapper = mountPanel()
    await flushPromises()

    expect(api.fetchSettingsDomain).toHaveBeenCalledWith('seo')
    expect(wrapper.find('[data-test="settings-loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="settings-save"]').exists()).toBe(true)
  })

  it('submits the loaded object and confirms success', async () => {
    api.fetchSettingsDomain.mockResolvedValue({ data: seo(), meta: { domain: 'seo' } })
    api.updateSettingsDomain.mockResolvedValue({ data: seo({ robotsPolicy: 'noindex' }), meta: { domain: 'seo' } })
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.get('[data-test="settings-save"]').trigger('click')
    await flushPromises()

    expect(api.updateSettingsDomain).toHaveBeenCalledWith('seo', expect.objectContaining({ robotsPolicy: 'index,follow' }))
    expect(refreshNuxtData).toHaveBeenCalledWith('public:site-config')
    expect(wrapper.get('[data-test="settings-saved"]').text()).toContain('已保存')
  })

  it('saves only the selected profile section and preserves other unsaved edits', async () => {
    const persisted = profile()
    api.fetchSettingsDomain.mockResolvedValue({ data: persisted, meta: { domain: 'profile' } })
    api.updateSettingsDomain.mockImplementation(async (_domain: string, body: ProfileSettings) => ({
      data: structuredClone(body),
      meta: { domain: 'profile' }
    }))
    const wrapper = mount(SettingsDomainPanel, {
      props: { domain: 'profile' as never },
      global: { stubs: { ...stubs, SettingsProfileForm } }
    })
    await flushPromises()

    const profileForm = wrapper.getComponent(SettingsProfileForm)
    const draft = profileForm.props('value') as ProfileSettings
    draft.name = 'Saved name'
    draft.signature = 'Unsaved signature'

    await profileForm.get('[data-test="profile-save-identity"]').trigger('click')
    await flushPromises()

    expect(api.updateSettingsDomain).toHaveBeenCalledWith('profile', expect.objectContaining({
      name: 'Saved name',
      signature: 'Saved signature'
    }), { revision: null })
    expect((profileForm.props('value') as ProfileSettings).signature).toBe('Unsaved signature')
    expect(profileForm.text()).toContain('已保存')
    expect(wrapper.find('[data-test="settings-save"]').exists()).toBe(false)

    await profileForm.get('[data-test="profile-name"]').setValue('Edited after save')
    expect(profileForm.find('.profile-form__saved').exists()).toBe(false)

    draft.socialLinks.push({ platform: 'GitHub', url: 'https://github.com/tian', visible: true, sortOrder: 0 })
    draft.projects.push({
      name: 'Unsaved project',
      description: 'Not submitted with social links',
      status: '',
      tags: [],
      url: null,
      visible: true,
      sortOrder: 0
    })

    await profileForm.get('[data-test="profile-save-social"]').trigger('click')
    await flushPromises()

    expect(api.updateSettingsDomain).toHaveBeenLastCalledWith('profile', expect.objectContaining({
      signature: 'Saved signature',
      socialLinks: [expect.objectContaining({ platform: 'GitHub' })],
      projects: []
    }), { revision: null })
    expect((profileForm.props('value') as ProfileSettings).projects).toHaveLength(1)
  })

  it('does not overwrite edits made while a profile section save is in flight', async () => {
    const persisted = profile()
    api.fetchSettingsDomain.mockResolvedValue({ data: persisted, meta: { domain: 'profile', revision: 10 } })
    let resolveUpdate!: (value: unknown) => void
    api.updateSettingsDomain.mockReturnValue(new Promise(resolve => { resolveUpdate = resolve }))
    const wrapper = mount(SettingsDomainPanel, {
      props: { domain: 'profile' as never },
      global: { stubs: { ...stubs, SettingsProfileForm } }
    })
    await flushPromises()

    const profileForm = wrapper.getComponent(SettingsProfileForm)
    await profileForm.get('[data-test="profile-name"]').setValue('Submitted name')
    await profileForm.get('[data-test="profile-save-identity"]').trigger('click')
    await flushPromises()
    await profileForm.get('[data-test="profile-name"]').setValue('Newer unsaved name')

    resolveUpdate({
      data: { ...persisted, name: 'Submitted name' },
      meta: { domain: 'profile', revision: 11 }
    })
    await flushPromises()

    expect((profileForm.props('value') as ProfileSettings).name).toBe('Newer unsaved name')
    expect(profileForm.find('.profile-form__saved').exists()).toBe(false)
  })

  it('shows a scoped conflict message when the profile revision is stale', async () => {
    api.fetchSettingsDomain.mockResolvedValue({ data: profile(), meta: { domain: 'profile', revision: 10 } })
    api.updateSettingsDomain.mockRejectedValue({ data: { error: { code: 'settings_conflict' } } })
    const wrapper = mount(SettingsDomainPanel, {
      props: { domain: 'profile' as never },
      global: { stubs: { ...stubs, SettingsProfileForm } }
    })
    await flushPromises()

    const profileForm = wrapper.getComponent(SettingsProfileForm)
    await profileForm.get('[data-test="profile-save-identity"]').trigger('click')
    await flushPromises()

    expect(profileForm.get('.profile-form__save-error').text()).toContain('其他页面更新')
    expect(api.updateSettingsDomain).toHaveBeenCalledWith(
      'profile',
      expect.any(Object),
      { revision: 10 }
    )
  })

  it('shows a validation summary and forwards issues on validation_failed', async () => {
    api.fetchSettingsDomain.mockResolvedValue({ data: seo(), meta: { domain: 'seo' } })
    api.updateSettingsDomain.mockRejectedValue({ data: { error: { code: 'validation_failed' } } })
    api.settingsValidationIssues.mockReturnValue([{ path: ['robotsPolicy'], message: 'Required' }])
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.get('[data-test="settings-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="settings-save-error"]').text()).toContain('修正标记的字段')
    expect(wrapper.find('[data-test="seo-robots"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Required')
  })

  it('falls back to a generic message for a non-validation save failure', async () => {
    api.fetchSettingsDomain.mockResolvedValue({ data: seo(), meta: { domain: 'seo' } })
    api.updateSettingsDomain.mockRejectedValue({ data: { error: { message: 'Server exploded' } } })
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.get('[data-test="settings-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="settings-save-error"]').text()).toContain('Server exploded')
  })

  it('surfaces a load error when the fetch rejects', async () => {
    api.fetchSettingsDomain.mockRejectedValue({ data: { error: { message: 'No access' } } })
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.get('[data-test="settings-load-error"]').text()).toContain('No access')
    expect(wrapper.find('[data-test="settings-save"]').exists()).toBe(false)
  })
})
