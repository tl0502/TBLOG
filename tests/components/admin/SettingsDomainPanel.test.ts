import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, shallowRef } from 'vue'
import SettingsDomainPanel from '../../../components/admin/SettingsDomainPanel.vue'
import SettingsProfileForm from '../../../components/admin/SettingsProfileForm.vue'
import type { ProfileSettings, SeoSettings, SiteSettings } from '../../../composables/useAdminApi'

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

function site(): Pick<SiteSettings, 'siteName' | 'description'> {
  return {
    siteName: 'TBLOG',
    description: 'A personal blog'
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

const requestFetch = vi.fn()

async function mountPanel(domain = 'seo', extraStubs: Record<string, unknown> = {}) {
  const Host = defineComponent({
    components: { SettingsDomainPanel },
    setup() {
      return { domain }
    },
    template: '<Suspense><SettingsDomainPanel :domain="domain" /></Suspense>'
  })
  const wrapper = mount(Host, { global: { stubs: { ...stubs, ...extraStubs } } })
  await flushPromises()
  return wrapper
}

describe('SettingsDomainPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('refreshNuxtData', vi.fn().mockResolvedValue(undefined))
    vi.stubGlobal('useRequestFetch', () => requestFetch)
    vi.stubGlobal('useAsyncData', vi.fn(async (_key: string, handler: () => Promise<unknown>) => {
      try {
        const result = await handler()
        return {
          data: shallowRef(result),
          error: shallowRef(null),
          pending: shallowRef(false)
        }
      } catch (error) {
        return {
          data: shallowRef(null),
          error: shallowRef(error),
          pending: shallowRef(false)
        }
      }
    }))
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
    requestFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/seo')) return { data: seo(), meta: { domain: 'seo' } }
      if (url.endsWith('/site')) return { data: site(), meta: { domain: 'site' } }
      if (url.endsWith('/profile')) return { data: profile(), meta: { domain: 'profile', revision: 10 } }
      throw new Error(`unexpected settings url: ${url}`)
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('loads the domain settings via useAsyncData and shows the save control', async () => {
    const wrapper = await mountPanel()

    expect(useAsyncData).toHaveBeenCalledWith('admin-settings-seo', expect.any(Function))
    expect(requestFetch).toHaveBeenCalledWith('/api/v1/admin/settings/seo')
    expect(wrapper.find('[data-test="settings-loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="settings-save"]').exists()).toBe(true)
  })

  it('submits the loaded object and confirms success', async () => {
    api.updateSettingsDomain.mockResolvedValue({ data: seo({ robotsPolicy: 'noindex' }), meta: { domain: 'seo' } })
    const wrapper = await mountPanel()

    await wrapper.get('[data-test="settings-save"]').trigger('click')
    await flushPromises()

    expect(api.updateSettingsDomain).toHaveBeenCalledWith('seo', expect.objectContaining({ robotsPolicy: 'index,follow' }))
    expect(refreshNuxtData).toHaveBeenCalledWith('public:site-config')
    expect(wrapper.get('[data-test="settings-saved"]').text()).toContain('已保存')
  })

  it('saves only the selected profile section and preserves other unsaved edits', async () => {
    const persisted = profile()
    requestFetch.mockResolvedValue({ data: persisted, meta: { domain: 'profile', revision: null } })
    api.fetchSettingsDomain.mockResolvedValue({ data: persisted, meta: { domain: 'profile', revision: null } })
    api.updateSettingsDomain.mockImplementation(async (_domain: string, body: ProfileSettings) => ({
      data: structuredClone(body),
      meta: { domain: 'profile' }
    }))
    const wrapper = await mountPanel('profile', { SettingsProfileForm })

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
    requestFetch.mockResolvedValue({ data: persisted, meta: { domain: 'profile', revision: 10 } })
    api.fetchSettingsDomain.mockResolvedValue({ data: persisted, meta: { domain: 'profile', revision: 10 } })
    let resolveUpdate!: (value: unknown) => void
    api.updateSettingsDomain.mockReturnValue(new Promise(resolve => { resolveUpdate = resolve }))
    const wrapper = await mountPanel('profile', { SettingsProfileForm })

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
    requestFetch.mockResolvedValue({ data: profile(), meta: { domain: 'profile', revision: 10 } })
    api.fetchSettingsDomain.mockResolvedValue({ data: profile(), meta: { domain: 'profile', revision: 10 } })
    api.updateSettingsDomain.mockRejectedValue({ data: { error: { code: 'settings_conflict' } } })
    const wrapper = await mountPanel('profile', { SettingsProfileForm })

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
    api.updateSettingsDomain.mockRejectedValue({ data: { error: { code: 'validation_failed' } } })
    api.settingsValidationIssues.mockReturnValue([{ path: ['robotsPolicy'], message: 'Required' }])
    const wrapper = await mountPanel()

    await wrapper.get('[data-test="settings-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="settings-save-error"]').text()).toContain('修正标记的字段')
    expect(wrapper.find('[data-test="seo-robots"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Required')
  })

  it('falls back to a generic message for a non-validation save failure', async () => {
    api.updateSettingsDomain.mockRejectedValue({ data: { error: { message: 'Server exploded' } } })
    const wrapper = await mountPanel()

    await wrapper.get('[data-test="settings-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="settings-save-error"]').text()).toContain('Server exploded')
  })

  it('surfaces a load error when the fetch rejects', async () => {
    requestFetch.mockRejectedValue({ data: { error: { message: 'No access' } } })
    const wrapper = await mountPanel()

    expect(wrapper.get('[data-test="settings-load-error"]').text()).toContain('No access')
    expect(wrapper.find('[data-test="settings-save"]').exists()).toBe(false)
  })
})
