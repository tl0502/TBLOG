import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import SettingsSecurityView from '../../../components/admin/SettingsSecurityView.vue'

const api = vi.hoisted(() => ({
  apiErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
  disableAdminTwoFactor: vi.fn(),
  enableAdminTwoFactor: vi.fn(),
  fetchAdminLoginAttempts: vi.fn(),
  replaceAdminIpRules: vi.fn(),
  startAdminTwoFactor: vi.fn(),
  updateAdminAccount: vi.fn(),
  useAdminSecurity: vi.fn()
}))

vi.mock('~/composables/useAdminApi', () => api)
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr') } }))

describe('SettingsSecurityView', () => {
  let refresh: ReturnType<typeof vi.fn>
  let overviewError: ReturnType<typeof ref<unknown>>

  beforeEach(() => {
    vi.clearAllMocks()
    refresh = vi.fn().mockResolvedValue(undefined)
    overviewError = ref(null)
    api.useAdminSecurity.mockReturnValue({
      data: ref({
        data: {
          account: { id: 'admin-1', username: 'owner' },
          twoFactor: { available: false, enabled: false },
          ipAccess: { currentIp: '192.0.2.1', allow: [], deny: [] }
        },
        meta: {}
      }),
      pending: ref(false),
      error: overviewError,
      refresh
    })
    api.fetchAdminLoginAttempts.mockResolvedValue({
      data: [{
        id: 'attempt-1', adminId: 'admin-1', username: 'owner', ipAddress: '192.0.2.1',
        successful: true, failureReason: null, createdAt: '2026-07-17T00:00:00.000Z'
      }],
      meta: { total: 1, offset: 0, limit: 25 }
    })
    api.updateAdminAccount.mockResolvedValue({ data: { administrator: { id: 'admin-1', username: 'owner' } } })
    api.replaceAdminIpRules.mockResolvedValue({ data: { allow: ['192.0.2.1'], deny: [] } })
  })

  it('renders account, 2FA availability, IP policy, and login history', async () => {
    const wrapper = mount(SettingsSecurityView)
    await flushPromises()

    expect(wrapper.get('[data-test="security-settings"]').text()).toContain('账户与密码')
    expect(wrapper.text()).toContain('AUTH_ENCRYPTION_KEY')
    expect(wrapper.text()).toContain('192.0.2.1')
    expect(wrapper.get('[data-test="security-login-history"]').text()).toContain('owner')
    expect(api.fetchAdminLoginAttempts).toHaveBeenCalledWith(0, 25)
  })

  it('submits account and IP changes through dedicated security APIs', async () => {
    const wrapper = mount(SettingsSecurityView)
    await flushPromises()

    const account = wrapper.get('[data-test="security-account-form"]')
    const accountInputs = account.findAll('input')
    await accountInputs[1].setValue('correct horse battery staple')
    await accountInputs[2].setValue('a newly secured password')
    await accountInputs[3].setValue('a newly secured password')
    await account.trigger('submit')
    await flushPromises()
    expect(api.updateAdminAccount).toHaveBeenCalledWith({
      currentPassword: 'correct horse battery staple',
      username: 'owner',
      password: 'a newly secured password'
    })

    const ipForm = wrapper.get('[data-test="security-ip-form"]')
    await ipForm.findAll('textarea')[0].setValue('192.0.2.1')
    await ipForm.trigger('submit')
    await flushPromises()
    expect(api.replaceAdminIpRules).toHaveBeenCalledWith({ allow: ['192.0.2.1'], deny: [] })
  })

  it('keeps an account mutation successful when refreshing the overview fails', async () => {
    refresh.mockRejectedValueOnce(new Error('refresh failed'))
    const wrapper = mount(SettingsSecurityView)
    await flushPromises()

    const account = wrapper.get('[data-test="security-account-form"]')
    await account.findAll('input')[1].setValue('correct horse battery staple')
    await account.trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('账户信息已更新')
    expect(wrapper.text()).not.toContain('无法更新账户信息')
    expect(wrapper.get('[data-test="security-refresh-error"]').text()).toContain('操作已成功')
  })

  it('keeps recovery codes visible when the overview refresh fails after enabling 2FA', async () => {
    api.useAdminSecurity.mockReturnValue({
      data: ref({
        data: {
          account: { id: 'admin-1', username: 'owner' },
          twoFactor: { available: true, enabled: false },
          ipAccess: { currentIp: '192.0.2.1', allow: [], deny: [] }
        },
        meta: {}
      }),
      pending: ref(false),
      error: ref(null),
      refresh
    })
    api.startAdminTwoFactor.mockResolvedValue({
      data: { secret: 'OTPSECRET', otpauthUri: 'otpauth://totp/TBLOG:owner?secret=OTPSECRET' }
    })
    api.enableAdminTwoFactor.mockResolvedValue({ data: { recoveryCodes: ['ABCD-EFGH', 'JKLM-NPQR'] } })
    refresh.mockRejectedValueOnce(new Error('refresh failed'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    const wrapper = mount(SettingsSecurityView)
    await flushPromises()

    const startForm = wrapper.get('[data-test="security-two-factor-start"]')
    await startForm.get('input').setValue('correct horse battery staple')
    await startForm.trigger('submit')
    await flushPromises()
    const setupForm = wrapper.get('[data-test="security-two-factor-enable"]')
    const enableInputs = setupForm.findAll('input')
    await enableInputs[0].setValue('correct horse battery staple')
    await enableInputs[1].setValue('123456')
    await setupForm.trigger('submit')
    await flushPromises()

    expect(api.enableAdminTwoFactor).toHaveBeenCalledWith({
      currentPassword: 'correct horse battery staple',
      code: '123456'
    })
    expect(wrapper.text()).toContain('双重认证已开启')
    expect(wrapper.text()).toContain('ABCD-EFGH')
    expect(wrapper.text()).toContain('JKLM-NPQR')
    expect(wrapper.text()).not.toContain('无法开启双重认证')
    expect(wrapper.get('[data-test="security-recovery-codes"]').isVisible()).toBe(true)
    expect(wrapper.find('.security-status--on').exists()).toBe(true)
    expect(wrapper.get('[data-test="security-refresh-error"]').text()).toContain('操作已成功')

    await wrapper.get('[data-test="security-copy-recovery"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH\nJKLM-NPQR')
    expect(wrapper.get('[data-test="security-recovery-copy-message"]').text()).toContain('已复制')
  })

  it('refreshes the overview after saving IP rules', async () => {
    const wrapper = mount(SettingsSecurityView)
    await flushPromises()

    const ipForm = wrapper.get('[data-test="security-ip-form"]')
    await ipForm.findAll('textarea')[0].setValue('192.0.2.1')
    await ipForm.trigger('submit')
    await flushPromises()

    expect(api.replaceAdminIpRules).toHaveBeenCalledWith({ allow: ['192.0.2.1'], deny: [] })
    expect(refresh).toHaveBeenCalled()
  })

  it('treats a resolved refresh with a read error as a refresh warning', async () => {
    refresh.mockImplementationOnce(async () => {
      overviewError.value = new Error('refresh failed')
    })
    const wrapper = mount(SettingsSecurityView)
    await flushPromises()

    const account = wrapper.get('[data-test="security-account-form"]')
    await account.findAll('input')[1].setValue('correct horse battery staple')
    await account.trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('账户信息已更新')
    expect(wrapper.get('[data-test="security-refresh-error"]').text()).toContain('操作已成功')
    expect(wrapper.text()).not.toContain('无法更新账户信息')
  })

  it('renders an empty login-history range as 0–0', async () => {
    api.fetchAdminLoginAttempts.mockResolvedValue({
      data: [],
      meta: { total: 0, offset: 0, limit: 25 }
    })
    const wrapper = mount(SettingsSecurityView)
    await flushPromises()

    expect(wrapper.get('.security-pagination').text()).toContain('0–0 / 0')
    expect(wrapper.get('.security-pagination').text()).not.toContain('1–0')
  })
})
