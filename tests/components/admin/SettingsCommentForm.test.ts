import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import SettingsCommentForm from '../../../components/admin/SettingsCommentForm.vue'
import type { CommentSettings } from '../../../types/settings'

const integrations = vi.hoisted(() => ({
  useAdminIntegrations: vi.fn()
}))

vi.mock('~/composables/useAdminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../composables/useAdminApi')>('../../../composables/useAdminApi')
  return {
    ...actual,
    useAdminIntegrations: integrations.useAdminIntegrations
  }
})

function value(overrides: Partial<CommentSettings> = {}): CommentSettings {
  return {
    enabled: true,
    autoModerationEnabled: true,
    turnstileSiteKey: null,
    rateLimit: { windowSeconds: null, maxPerWindow: null },
    ...overrides
  }
}

function mockIntegrations(rows: Array<Record<string, unknown>> = []) {
  integrations.useAdminIntegrations.mockReturnValue({
    data: ref({ data: rows, meta: { total: rows.length } }),
    pending: ref(false),
    error: ref(null),
    refresh: vi.fn()
  })
}

describe('SettingsCommentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIntegrations()
  })

  it('clears automatic moderation when comments are disabled', async () => {
    const settings = value()
    const wrapper = mount(SettingsCommentForm, { props: { value: settings, issues: [] } })
    await flushPromises()

    await wrapper.get('[data-test="comment-enabled"]').setValue(false)

    expect(settings.enabled).toBe(false)
    expect(settings.autoModerationEnabled).toBe(false)
    expect(wrapper.get('[data-test="comment-auto-moderation"]').attributes('disabled')).toBeDefined()
  })

  it('edits rate-limit fields and keeps empty values as runtime defaults', async () => {
    const settings = value({ rateLimit: { windowSeconds: 120, maxPerWindow: 3 } })
    const wrapper = mount(SettingsCommentForm, { props: { value: settings, issues: [] } })
    await flushPromises()

    await wrapper.get('[data-test="comment-rate-window"]').setValue('300')
    await wrapper.get('[data-test="comment-rate-max"]').setValue('12')
    expect(settings.rateLimit).toEqual({ windowSeconds: 300, maxPerWindow: 12 })

    await wrapper.get('[data-test="comment-rate-window"]').setValue('')
    await wrapper.get('[data-test="comment-rate-max"]').setValue('')
    expect(settings.rateLimit).toEqual({ windowSeconds: null, maxPerWindow: null })
  })

  it('warns when comments are accepted without ready comment protection', async () => {
    mockIntegrations([{
      capability: 'commentProtection',
      providerKey: 'turnstile',
      enabled: false,
      status: 'disabled',
      missingSecrets: ['TURNSTILE_SECRET_KEY']
    }])
    const wrapper = mount(SettingsCommentForm, { props: { value: value(), issues: [] } })
    await flushPromises()

    expect(wrapper.get('[data-test="comment-protection-warning"]').text()).toContain('评论保护')
  })

  it('warns when automatic moderation is on without exactly one active provider', async () => {
    mockIntegrations([
      {
        capability: 'commentModeration',
        providerKey: 'http',
        enabled: true,
        status: 'active',
        missingSecrets: []
      },
      {
        capability: 'commentModeration',
        providerKey: 'openai',
        enabled: true,
        status: 'active',
        missingSecrets: []
      }
    ])
    const wrapper = mount(SettingsCommentForm, {
      props: { value: value({ autoModerationEnabled: true }), issues: [] }
    })
    await flushPromises()

    expect(wrapper.get('[data-test="comment-moderation-warning"]').text()).toContain('评论审核')
  })
})
