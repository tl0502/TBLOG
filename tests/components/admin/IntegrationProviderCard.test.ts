import { flushPromises, mount } from '@vue/test-utils'
import IntegrationProviderCard from '../../../components/admin/IntegrationProviderCard.vue'
import type { IntegrationView } from '../../../composables/useAdminApi'

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
    formMeta: [
      { key: 'siteKey', label: 'Site key', type: 'text', required: true, help: 'Public key.' }
    ],
    actions: [{ key: 'test', label: 'Check status' }],
    ...overrides
  }
}

function mountCard(overrides: Partial<IntegrationView> = {}, props: Record<string, unknown> = {}) {
  return mount(IntegrationProviderCard, {
    props: { integration: integrationView(overrides), ...props }
  })
}

describe('IntegrationProviderCard', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('renders each formMeta field type with the configured value', () => {
    const wrapper = mountCard({
      config: { siteKey: '0xABC', mode: 'strict', verbose: true },
      formMeta: [
        { key: 'siteKey', label: 'Site key', type: 'text', required: true },
        {
          key: 'mode',
          label: 'Mode',
          type: 'select',
          required: false,
          options: [
            { value: 'strict', label: 'Strict' },
            { value: 'lax', label: 'Lax' }
          ]
        },
        { key: 'verbose', label: 'Verbose', type: 'boolean', required: false }
      ]
    })

    expect((wrapper.get('[data-test="integration-field-siteKey"]').element as HTMLInputElement).value).toBe('0xABC')
    expect((wrapper.get('[data-test="integration-field-mode"]').element as unknown as HTMLSelectElement).value).toBe('strict')
    expect((wrapper.get('[data-test="integration-field-verbose"]').element as HTMLInputElement).checked).toBe(true)
  })

  it('emits save with the enabled flag and trimmed config, omitting blank text fields', async () => {
    const wrapper = mountCard()

    await wrapper.get('[data-test="integration-enabled"]').setValue(true)
    await wrapper.get('[data-test="integration-field-siteKey"]').setValue('  0xKEY  ')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('save')).toEqual([[{ enabled: true, config: { siteKey: '0xKEY' } }]])
  })

  it('omits an empty optional text field from the saved config', async () => {
    const wrapper = mountCard()

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('save')).toEqual([[{ enabled: false, config: {} }]])
  })

  it('renders detected model suggestions as a datalist for text fields', () => {
    const wrapper = mountCard({
      capability: 'commentModeration',
      providerKey: 'http',
      displayName: 'OpenAI-Compatible LLM',
      config: { model: 'safe-model' },
      formMeta: [{
        key: 'model',
        label: 'Model',
        type: 'text',
        required: true,
        options: [
          { value: 'safe-model', label: 'safe-model' },
          { value: 'other-model', label: 'other-model' }
        ]
      }],
      actions: [{ key: 'listModels', label: 'Detect models' }]
    })

    const input = wrapper.get('[data-test="integration-field-model"]').element as HTMLInputElement
    expect(input.getAttribute('list')).toContain('datalist-')
    expect(wrapper.get('[data-test="integration-datalist-model"]').html()).toContain('other-model')
    expect(wrapper.get('[data-test="integration-action-listModels"]').text()).toContain('检测模型')
  })

  it('localizes analytics registry field labels by provider semantics', () => {
    const wrapper = mountCard({
      capability: 'analytics',
      providerKey: 'plausible',
      displayName: 'Plausible',
      formMeta: [
        { key: 'scriptUrl', label: 'Script URL', type: 'url', required: true },
        { key: 'siteId', label: 'Domain', type: 'text', required: true },
        { key: 'renderConfigJson', label: 'Extra attributes', type: 'text', required: false }
      ],
      actions: []
    })

    expect(wrapper.text()).toContain('脚本 URL')
    expect(wrapper.text()).toContain('统计域名')
    expect(wrapper.text()).toContain('自定义脚本属性（JSON）')
  })

  it('shows a missing-secret warning naming the variable and never renders a secret input', () => {
    const wrapper = mountCard({ missingSecrets: ['TURNSTILE_SECRET_KEY'], status: 'unavailable' })

    const warning = wrapper.get('[data-test="integration-missing"]')
    expect(warning.text()).toContain('TURNSTILE_SECRET_KEY')
    expect(warning.text()).toContain('Cloudflare')
    expect(wrapper.find('[data-test="integration-field-TURNSTILE_SECRET_KEY"]').exists()).toBe(false)
  })

  it('renders provider actions and emits the action key on click', async () => {
    const wrapper = mountCard()

    await wrapper.get('[data-test="integration-action-test"]').trigger('click')

    expect(wrapper.emitted('action')).toEqual([['test', {}]])
  })

  it('generates a self-hosted Secret entirely in the browser and excludes credentials from saves', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'opaque-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1', role: 'view-only' })))
    vi.stubGlobal('fetch', fetch)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    })
    const wrapper = mountCard({
      capability: 'analyticsReport',
      providerKey: 'umami',
      displayName: 'Umami Analytics Report',
      config: { apiBaseUrl: 'https://umami.example.com/api', authMode: 'bearer' },
      formMeta: [
        { key: 'apiBaseUrl', label: 'API base', type: 'url', required: true },
        {
          key: 'authMode', label: 'Authentication', type: 'select', required: true,
          options: [{ value: 'bearer', label: 'Bearer' }]
        },
        { key: 'credentialUsername', label: 'Username', type: 'text', required: false, persist: false },
        { key: 'credentialPassword', label: 'Password', type: 'password', required: false, persist: false }
      ],
      actions: [{
        key: 'generateCredential',
        label: 'Generate',
        kind: 'client',
        clientHandler: 'umamiSelfHostedCredential'
      }]
    })

    await wrapper.get('[data-test="integration-field-credentialUsername"]').setValue('reader')
    await wrapper.get('[data-test="integration-field-credentialPassword"]').setValue('password')
    await wrapper.get('[data-test="integration-action-generateCredential"]').trigger('click')
    await flushPromises()

    const expected = JSON.stringify({
      apiBaseUrl: 'https://umami.example.com/api',
      token: 'opaque-token'
    })
    expect(wrapper.get('[data-test="integration-credential-output"]').attributes('value')).toBe(expected)
    expect((wrapper.get('[data-test="integration-field-credentialPassword"]')
      .element as HTMLInputElement).value).toBe('')
    expect(wrapper.emitted('action')).toBeUndefined()

    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([[
      {
        enabled: false,
        config: { apiBaseUrl: 'https://umami.example.com/api', authMode: 'bearer' }
      }
    ]])

    await wrapper.get('[data-test="integration-copy-credential"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(expected)
  })

  it('labels analytics checks as configuration validation without changing other capabilities', () => {
    const analytics = mountCard({
      capability: 'analytics',
      providerKey: 'umami',
      displayName: 'Umami',
      formMeta: []
    })
    const turnstile = mountCard()

    expect(analytics.get('[data-test="integration-action-test"]').text()).toBe('验证配置')
    expect(turnstile.get('[data-test="integration-action-test"]').text()).toBe('检查状态')
  })

  it('labels Cloudflare storage checks as configuration and binding checks', () => {
    const wrapper = mountCard({
      capability: 'storage',
      providerKey: 'cloudflare-r2',
      displayName: 'Cloudflare R2 Storage',
      formMeta: [],
      actions: [{ key: 'test', label: 'Check configuration and binding' }]
    })

    expect(wrapper.get('[data-test="integration-action-test"]').text()).toBe('检查配置与绑定')
  })

  it('shows the last error and an operation error, and disables controls while busy', () => {
    const wrapper = mountCard(
      { lastError: 'Turnstile site key is not set' },
      { busy: true, error: 'Unable to save this integration.' }
    )

    expect(wrapper.get('[data-test="integration-last-error"]').text()).toContain('Turnstile site key is not set')
    expect(wrapper.get('[data-test="integration-op-error"]').text()).toContain('Unable to save this integration.')
    expect(wrapper.get('[data-test="integration-save"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="integration-action-test"]').attributes('disabled')).toBeDefined()
  })

  it('resyncs the form when the integration view changes after a refresh', async () => {
    const wrapper = mountCard()
    await wrapper.get('[data-test="integration-field-siteKey"]').setValue('draft')

    await wrapper.setProps({
      integration: integrationView({ enabled: true, status: 'active', config: { siteKey: '0xSERVER' } })
    })

    expect((wrapper.get('[data-test="integration-field-siteKey"]').element as HTMLInputElement).value).toBe('0xSERVER')
    expect((wrapper.get('[data-test="integration-enabled"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('[data-test="integration-status"]').text()).toBe('运行中')
  })
})
