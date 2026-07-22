import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref, shallowRef, Suspense } from 'vue'
import IntegrationCenter from '../../../components/admin/IntegrationCenter.vue'
import type { IntegrationView } from '../../../composables/useAdminApi'

const api = vi.hoisted(() => ({
  useAdminIntegrations: vi.fn(),
  updateIntegration: vi.fn(),
  runIntegrationAction: vi.fn(),
  apiErrorMessage: vi.fn((error: unknown, fallback: string) => {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    return message || fallback
  })
}))
const refreshNuxtData = vi.fn()

vi.mock('~/composables/useAdminApi', () => api)

function integrationView(overrides: Partial<IntegrationView> = {}): IntegrationView {
  return {
    capability: 'commentProtection',
    providerKey: 'turnstile',
    displayName: 'Cloudflare Turnstile',
    enabled: false,
    status: 'disabled',
    lastCheckedAt: null,
    lastError: null,
    config: {},
    requiredSecrets: ['TURNSTILE_SECRET_KEY'],
    requiredBindings: [],
    missingSecrets: [],
    missingBindings: [],
    formMeta: [{ key: 'siteKey', label: 'Site key', type: 'text', required: true }],
    actions: [{ key: 'test', label: 'Check status' }],
    ...overrides
  }
}

function setupList(options: { rows?: IntegrationView[]; error?: unknown; pending?: boolean } = {}) {
  const data = shallowRef(
    options.rows === undefined && options.error
      ? null
      : { data: options.rows ?? [integrationView()], meta: { total: (options.rows ?? [integrationView()]).length } }
  )
  const refresh = vi.fn().mockResolvedValue(undefined)
  api.useAdminIntegrations.mockResolvedValue({
    data,
    pending: ref(options.pending ?? false),
    error: ref(options.error ?? null),
    refresh
  })
  return { data, refresh }
}

async function mountCenter(props: { capabilities?: IntegrationView['capability'][]; embedded?: boolean } = {}) {
  const wrapper = mount(
    defineComponent({
      render() {
        return h(Suspense, null, { default: () => h(IntegrationCenter, props) })
      }
    })
  )
  await flushPromises()
  return wrapper
}

describe('IntegrationCenter', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('refreshNuxtData', refreshNuxtData)
    api.apiErrorMessage.mockImplementation((error: unknown, fallback: string) => {
      const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
      return message || fallback
    })
  })

  it('groups providers by capability', async () => {
    setupList({
      rows: [
        integrationView(),
        integrationView({ capability: 'search', providerKey: 'algolia', displayName: 'Algolia' })
      ]
    })
    const wrapper = await mountCenter()

    expect(wrapper.find('[data-test="integration-group-commentProtection"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="integration-group-search"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="integration-card-search-algolia"]').exists()).toBe(true)
  })

  it('embeds only the capabilities owned by the active Settings domain', async () => {
    setupList({
      rows: [
        integrationView(),
        integrationView({ capability: 'search', providerKey: 'algolia', displayName: 'Algolia' })
      ]
    })
    const wrapper = await mountCenter({ capabilities: ['search'], embedded: true })

    expect(wrapper.find('.admin-page-header').exists()).toBe(false)
    expect(wrapper.find('[data-test="integration-group-search"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="integration-group-commentProtection"]').exists()).toBe(false)
  })

  it('shows a read error when the list fails to load', async () => {
    setupList({ error: { data: { error: { message: 'Integrations are unavailable.' } } } })
    const wrapper = await mountCenter()

    expect(wrapper.get('[data-test="integrations-read-error"]').text()).toContain('Integrations are unavailable.')
  })

  it('saves a provider and refreshes it from the returned view', async () => {
    const { refresh } = setupList()
    api.updateIntegration.mockResolvedValue({
      data: integrationView({ enabled: true, status: 'active', config: { siteKey: '0xNEW' } })
    })
    const wrapper = await mountCenter()

    await wrapper.get('[data-test="integration-field-siteKey"]').setValue('0xNEW')
    await wrapper.get('[data-test="integration-enabled"]').setValue(true)
    await wrapper.get('[data-test="integration-save"]').trigger('submit')
    await flushPromises()

    expect(api.updateIntegration).toHaveBeenCalledWith('commentProtection', 'turnstile', {
      enabled: true,
      config: { siteKey: '0xNEW' }
    })
    expect(wrapper.get('[data-test="integration-status"]').text()).toBe('运行中')
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('trusts the returned view when the server pulls enabled back to false', async () => {
    setupList()
    api.updateIntegration.mockResolvedValue({
      data: integrationView({ enabled: false, status: 'misconfigured', lastError: 'Turnstile site key is not set' })
    })
    const wrapper = await mountCenter()

    await wrapper.get('[data-test="integration-enabled"]').setValue(true)
    await wrapper.get('[data-test="integration-save"]').trigger('submit')
    await flushPromises()

    expect((wrapper.get('[data-test="integration-enabled"]').element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.get('[data-test="integration-status"]').text()).toBe('配置错误')
    expect(wrapper.get('[data-test="integration-last-error"]').text()).toContain('Turnstile site key is not set')
  })

  it('runs a provider action and refreshes status and last-checked from the returned view', async () => {
    const { refresh } = setupList()
    api.runIntegrationAction.mockResolvedValue({
      data: integrationView({ status: 'active', lastCheckedAt: '2026-07-14T08:00:00.000Z' })
    })
    const wrapper = await mountCenter()

    await wrapper.get('[data-test="integration-action-test"]').trigger('click')
    await flushPromises()

    expect(api.runIntegrationAction).toHaveBeenCalledWith(
      'commentProtection', 'turnstile', 'test'
    )
    expect(wrapper.get('[data-test="integration-status"]').text()).toBe('运行中')
    expect(wrapper.find('[data-test="integration-last-checked"]').exists()).toBe(true)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('refreshes public search configuration after search saves and actions', async () => {
    const searchView = integrationView({
      capability: 'search',
      providerKey: 'algolia',
      displayName: 'Algolia'
    })
    setupList({ rows: [searchView] })
    api.updateIntegration.mockResolvedValue({ data: searchView })
    api.runIntegrationAction.mockResolvedValue({ data: searchView })
    const wrapper = await mountCenter({ capabilities: ['search'], embedded: true })

    await wrapper.get('[data-test="integration-save"]').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-test="integration-action-test"]').trigger('click')
    await flushPromises()

    expect(refreshNuxtData).toHaveBeenCalledWith('public:search-config')
    expect(refreshNuxtData.mock.calls.filter(([key]) => key === 'public:search-config')).toHaveLength(2)
    expect(refreshNuxtData.mock.calls.filter(([key]) => key === 'public:site-config')).toHaveLength(2)
  })

  it('surfaces an operation error against the affected provider card', async () => {
    setupList()
    api.updateIntegration.mockRejectedValue({ data: { error: { message: 'Invalid config.' } } })
    const wrapper = await mountCenter()

    await wrapper.get('[data-test="integration-save"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-test="integration-op-error"]').text()).toContain('Invalid config.')
  })
})
