import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({
  adminLogin: vi.fn(),
  apiErrorCode: vi.fn((error: { code?: string }) => error.code ?? null)
}))
vi.mock('~/composables/useAdminApi', () => api)

describe('admin login page', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useRoute', () => ({ query: {} }))
    vi.stubGlobal('navigateTo', vi.fn())
  })

  afterEach(() => vi.unstubAllGlobals())

  it('asks for the second factor only after the server requires it', async () => {
    api.adminLogin
      .mockRejectedValueOnce({ code: 'two_factor_required' })
      .mockResolvedValue({ data: { admin: { username: 'owner' } }, meta: {} })
    const Page = (await import('../../pages/admin/login.vue')).default
    const wrapper = mount(Page)
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('owner')
    await inputs[1].setValue('correct horse battery staple')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('双重验证')

    const secondFactorInput = wrapper.get('input[autocomplete="one-time-code"]')
    expect(secondFactorInput.attributes('inputmode')).toBeUndefined()
    expect(secondFactorInput.attributes('pattern')).toBeUndefined()
    expect(secondFactorInput.attributes('spellcheck')).toBe('false')

    await secondFactorInput.setValue('123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.adminLogin).toHaveBeenLastCalledWith({
      username: 'owner', password: 'correct horse battery staple', secondFactor: '123456'
    })

    await secondFactorInput.setValue('ABCD-EFGH')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.adminLogin).toHaveBeenLastCalledWith({
      username: 'owner', password: 'correct horse battery staple', secondFactor: 'ABCD-EFGH'
    })
  })

  it('shows an explicit fail-closed message when login auditing is unavailable', async () => {
    api.adminLogin.mockRejectedValueOnce({ code: 'login_audit_unavailable' })
    const Page = (await import('../../pages/admin/login.vue')).default
    const wrapper = mount(Page)
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('owner')
    await inputs[1].setValue('correct horse battery staple')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('登录审计当前不可用')
    expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(false)
  })

  it.each([
    ['missing_session_secret', 'SESSION_SECRET 尚未配置'],
    ['invalid_session_secret', 'SESSION_SECRET 配置无效']
  ])('shows an explicit session configuration message for %s', async (code, message) => {
    api.adminLogin.mockRejectedValueOnce({ code })
    const Page = (await import('../../pages/admin/login.vue')).default
    const wrapper = mount(Page)
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('owner')
    await inputs[1].setValue('correct horse battery staple')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain(message)
  })
})
