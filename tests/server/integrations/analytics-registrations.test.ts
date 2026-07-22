import { vi } from 'vitest'
import {
  analyticsRegistrations,
  cloudflareWebAnalyticsRegistration,
  customAnalyticsRegistration,
  plausibleAnalyticsRegistration,
  umamiAnalyticsRegistration
} from '../../../server/integrations/providers/analytics'
import { sanitizeAnalyticsScriptAttributes } from '../../../utils/analytics-script-attributes'
import {
  httpAnalyticsReportRegistration,
  validateAnalyticsReportEndpoint
} from '../../../server/integrations/providers/http-analytics-report'
import { plausibleAnalyticsReportRegistration } from '../../../server/integrations/providers/plausible-analytics-report'
import { umamiAnalyticsReportRegistration } from '../../../server/integrations/providers/umami-analytics-report'
import { listRegistrationsByCapability } from '../../../server/integrations/registry'
import type {
  IntegrationSettingsRepository,
  StoredIntegration,
  UpsertIntegrationRecord
} from '../../../server/repositories/contracts/integration-repositories'
import { createIntegrationService } from '../../../server/services/integration-service'

class FakeIntegrationRepository implements IntegrationSettingsRepository {
  rows = new Map<string, StoredIntegration>()

  async list() {
    return [...this.rows.values()]
  }

  async findByCapabilityAndProvider(capability: string, providerKey: string) {
    return this.rows.get(`${capability}:${providerKey}`) ?? null
  }

  async upsert(record: UpsertIntegrationRecord) {
    this.store(record)
  }

  async upsertExclusive(record: UpsertIntegrationRecord, capability: string) {
    for (const row of this.rows.values()) {
      if (row.capability === capability) {
        row.enabled = false
        row.status = 'disabled'
      }
    }
    this.store(record)
  }

  async upsertOperationalStatus(record: UpsertIntegrationRecord) {
    await this.upsert(record)
  }

  async upsertAnalyticsReportExclusive(record: UpsertIntegrationRecord) {
    await this.upsertExclusive(record, 'analyticsReport')
  }

  async touch() {}

  private store(record: UpsertIntegrationRecord) {
    this.rows.set(`${record.capability}:${record.providerKey}`, { ...record })
  }
}

describe('analytics provider registrations', () => {
  it('registers the canonical analytics providers', () => {
    const providerKeys = ['cloudflare-web-analytics', 'umami', 'plausible', 'custom']
    expect(analyticsRegistrations.map((registration) => registration.providerKey)).toEqual(providerKeys)
    expect(listRegistrationsByCapability('analytics').map((registration) => registration.providerKey)).toEqual(
      providerKeys
    )
  })

  it('projects standardized public fields for each third-party provider', () => {
    expect(cloudflareWebAnalyticsRegistration.publicProjection({ siteId: 'token-1' })).toEqual({
      scriptUrl: null,
      siteId: 'token-1',
      renderConfig: {}
    })
    expect(umamiAnalyticsRegistration.publicProjection({ siteId: 'website-1' })).toMatchObject({
      scriptUrl: 'https://cloud.umami.is/script.js',
      siteId: 'website-1',
      renderConfig: {}
    })
    expect(plausibleAnalyticsRegistration.publicProjection({ siteId: 'blog.example' })).toMatchObject({
      scriptUrl: 'https://plausible.io/js/script.js',
      siteId: 'blog.example',
      renderConfig: {}
    })
    expect(plausibleAnalyticsRegistration.publicProjection({
      scriptUrl: 'https://legacy-plausible.example/js/script.js',
      siteId: 'blog.example'
    })).toMatchObject({
      scriptUrl: 'https://legacy-plausible.example/js/script.js',
      siteId: 'blog.example'
    })
    expect(customAnalyticsRegistration.publicProjection({ scriptUrl: 'https://cdn.example/a.js' })).toMatchObject({
      scriptUrl: 'https://cdn.example/a.js',
      siteId: null,
      renderConfig: {}
    })
  })

  it('retains a safe JSON edit field while projecting only whitelisted script attributes', () => {
    const config = customAnalyticsRegistration.configSchema.parse({
      scriptUrl: 'https://cdn.example/a.js',
      renderConfigJson: JSON.stringify({
        'data-host-url': 'https://analytics.example.com',
        crossorigin: 'anonymous',
        referrerpolicy: 'strict-origin-when-cross-origin',
        integrity: 'sha384-YWJjZA==',
        src: 'https://evil.example/override.js',
        async: false,
        'data-domain': 'evil.example',
        onload: 'alert(1)'
      })
    }) as Record<string, unknown>

    expect(customAnalyticsRegistration.validate(config)).toBeNull()
    expect(customAnalyticsRegistration.publicProjection(config)).toEqual({
      scriptUrl: 'https://cdn.example/a.js',
      siteId: null,
      renderConfig: {
        'data-host-url': 'https://analytics.example.com',
        crossorigin: 'anonymous',
        referrerpolicy: 'strict-origin-when-cross-origin',
        integrity: 'sha384-YWJjZA=='
      },
      renderConfigJson: JSON.stringify({
        'data-host-url': 'https://analytics.example.com',
        crossorigin: 'anonymous',
        referrerpolicy: 'strict-origin-when-cross-origin',
        integrity: 'sha384-YWJjZA=='
      })
    })
  })

  it('round-trips the renderConfigJson form field through IntegrationView', async () => {
    const repository = new FakeIntegrationRepository()
    const service = createIntegrationService({ integrationRepository: repository, env: {} })
    const renderConfigJson = JSON.stringify({ 'data-host-url': 'https://analytics.example.com' })

    const updated = await service.update('analytics', 'custom', {
      enabled: true,
      config: { scriptUrl: 'https://cdn.example/a.js', renderConfigJson }
    }, ['integration:*'])
    expect(updated.config).toMatchObject({
      scriptUrl: 'https://cdn.example/a.js',
      renderConfig: { 'data-host-url': 'https://analytics.example.com' },
      renderConfigJson
    })

    const listed = await service.list(['integration:*'])
    expect(listed.find((view) => view.providerKey === 'custom')?.config.renderConfigJson).toBe(
      renderConfigJson
    )
  })

  it('normalizes migrated renderConfig objects with the same whitelist', () => {
    expect(sanitizeAnalyticsScriptAttributes({
      'DATA-CUSTOM': 42,
      crossorigin: 'use-credentials',
      referrerpolicy: 'invalid',
      integrity: 'not-a-hash',
      textContent: 'alert(1)',
      nested: { unsafe: true }
    })).toEqual({
      'data-custom': '42',
      crossorigin: 'use-credentials'
    })
  })

  it('rejects malformed form JSON and non-HTTPS script URLs', () => {
    expect(customAnalyticsRegistration.validate({
      scriptUrl: 'https://cdn.example/a.js',
      renderConfigJson: '[]'
    })).toContain('JSON object')
    expect(customAnalyticsRegistration.validate({ scriptUrl: 'http://cdn.example/a.js' })).toContain('HTTPS')
    expect(customAnalyticsRegistration.validate({ scriptUrl: 'ftp://cdn.example/a.js' })).toContain('HTTPS')
    expect(validateAnalyticsReportEndpoint('http://analytics.example.com/report')).toContain('HTTPS')
    expect(validateAnalyticsReportEndpoint('https://user:pass@analytics.example.com/report')).toContain('credentials')
    expect(validateAnalyticsReportEndpoint('https://127.0.0.1/report')).toContain('public host')
    expect(validateAnalyticsReportEndpoint('https://[fe90::1]/report')).toContain('public host')
    expect(validateAnalyticsReportEndpoint('https://[febf::1]/report')).toContain('public host')
    expect(validateAnalyticsReportEndpoint('https://[::ffff:127.0.0.1]/report')).toContain('public host')
    expect(validateAnalyticsReportEndpoint('https://0x7f000001/report')).toContain('public host')
  })

  it('registers the report provider separately from browser collection scripts', () => {
    expect(listRegistrationsByCapability('analyticsReport')).toEqual([
      umamiAnalyticsReportRegistration,
      plausibleAnalyticsReportRegistration,
      httpAnalyticsReportRegistration
    ])
    expect(httpAnalyticsReportRegistration.requiredSecrets).toEqual(['ANALYTICS_REPORT_TOKEN'])
    expect(httpAnalyticsReportRegistration.requiredBindings).toEqual([])
  })

  it('requires only a non-empty token and no optional storage binding', async () => {
    await expect(httpAnalyticsReportRegistration.checkStatus(
      { endpoint: 'https://analytics.example.com/report' },
      { ANALYTICS_REPORT_TOKEN: '   ' }
    )).resolves.toMatchObject({ status: 'unavailable', error: 'Missing ANALYTICS_REPORT_TOKEN secret' })

    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: 1,
      revision: 'source-1',
      generatedAt: '2026-07-19T00:00:00.000Z',
      syncedThrough: '2026-07-18',
      articles: []
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(httpAnalyticsReportRegistration.checkStatus(
      { endpoint: 'https://analytics.example.com/report' },
      { ANALYTICS_REPORT_TOKEN: 'token', fetch }
    )).resolves.toEqual({ status: 'active' })
  })

  it('reports readiness without probing frontend-direct third-party services', () => {
    expect(cloudflareWebAnalyticsRegistration.checkStatus({}, {})).toMatchObject({ status: 'misconfigured' })
    expect(cloudflareWebAnalyticsRegistration.checkStatus({ siteId: 'token' }, {})).toEqual({ status: 'active' })
    expect(umamiAnalyticsRegistration.checkStatus({ siteId: 'website' }, {})).toEqual({ status: 'active' })
    expect(plausibleAnalyticsRegistration.checkStatus({ siteId: 'domain' }, {})).toEqual({ status: 'active' })
    expect(customAnalyticsRegistration.checkStatus({}, {})).toMatchObject({ status: 'misconfigured' })
    expect(customAnalyticsRegistration.checkStatus({ scriptUrl: 'https://cdn.example/a.js' }, {})).toEqual({
      status: 'active'
    })
  })

  it('describes collection-provider checks as local configuration validation', () => {
    for (const registration of analyticsRegistrations) {
      expect(registration.actions).toEqual([{ key: 'test', label: 'Validate configuration' }])
    }
    expect(customAnalyticsRegistration.formMeta.find((field) => field.key === 'scriptUrl')?.help)
      .toContain('HTTPS')
  })
})
