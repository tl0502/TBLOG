import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({
  apiErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
  applyAdminSetupMigrations: vi.fn(),
  setupAdmin: vi.fn()
}))

vi.mock('~/composables/useAdminApi', () => api)
vi.mock('~/composables/useTblogI18n', () => ({
  useTblogI18n: () => ({
    t: (key: string) => key
  })
}))

describe('admin setup page', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useRoute', () => ({ query: {} }))
    vi.stubGlobal('navigateTo', vi.fn().mockResolvedValue(undefined))
    api.applyAdminSetupMigrations
      .mockResolvedValueOnce({ data: { pending: ['0001_next.sql'] } })
      .mockResolvedValueOnce({ data: { pending: [] } })
    api.setupAdmin.mockResolvedValue({ data: { admin: { username: 'owner' } } })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('finishes all migration batches before sending administrator credentials', async () => {
    const Page = (await import('../../pages/admin/setup.vue')).default
    const wrapper = mount(Page)
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('owner')
    await inputs[1].setValue('correct horse battery staple')
    await inputs[2].setValue('correct horse battery staple')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(api.applyAdminSetupMigrations).toHaveBeenCalledTimes(2)
    expect(api.setupAdmin).toHaveBeenCalledOnce()
    expect(api.applyAdminSetupMigrations.mock.invocationCallOrder[1])
      .toBeLessThan(api.setupAdmin.mock.invocationCallOrder[0])
    expect(api.setupAdmin).toHaveBeenCalledWith({
      username: 'owner',
      password: 'correct horse battery staple'
    })
  })

  it('ignores a duplicate submit while setup is pending', async () => {
    let resolveFirst!: (value: unknown) => void
    api.applyAdminSetupMigrations.mockReset()
    api.applyAdminSetupMigrations.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
    const Page = (await import('../../pages/admin/setup.vue')).default
    const wrapper = mount(Page)
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('owner')
    await inputs[1].setValue('correct horse battery staple')
    await inputs[2].setValue('correct horse battery staple')
    const form = wrapper.get('form')
    const first = form.trigger('submit')
    await flushPromises()
    await form.trigger('submit')
    expect(api.applyAdminSetupMigrations).toHaveBeenCalledOnce()
    resolveFirst({ data: { pending: [] } })
    await first
    await flushPromises()
  })
})
