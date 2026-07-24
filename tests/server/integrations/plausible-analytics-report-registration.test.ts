import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PLAUSIBLE_BASE_URL,
  PLAUSIBLE_API_KEY_SECRET,
  plausibleAnalyticsReportConfigSchema,
  plausibleAnalyticsReportRegistration,
  validatePlausibleBaseUrl
} from '../../../server/integrations/providers/plausible-analytics-report'

function apiResponse() {
  return new Response(JSON.stringify({
    results: [{ dimensions: ['/posts/a'], metrics: [12] }],
    meta: { total_rows: 1 },
    query: {}
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('Plausible analytics report registration', () => {
  it('stores only public provider configuration and declares the API key secret', () => {
    expect(plausibleAnalyticsReportConfigSchema.parse({
      baseUrl: DEFAULT_PLAUSIBLE_BASE_URL,
      siteId: 'blog.example.com',
      timeoutMs: '5000',
      apiKey: 'must-not-be-persisted'
    })).toEqual({
      baseUrl: DEFAULT_PLAUSIBLE_BASE_URL,
      siteId: 'blog.example.com',
      timeoutMs: 5000
    })
    expect(plausibleAnalyticsReportRegistration).toMatchObject({
      capability: 'analyticsReport',
      providerKey: 'plausible',
      requiredSecrets: [PLAUSIBLE_API_KEY_SECRET],
      requiredBindings: []
    })
    expect(plausibleAnalyticsReportRegistration.formMeta
      .filter((field) => ['baseUrl', 'timeoutMs'].includes(field.key))
      .every((field) => !field.required)).toBe(true)
    expect(plausibleAnalyticsReportRegistration.formMeta
      .find((field) => field.key === 'siteId')?.required).toBe(true)
  })

  it.each([
    ['http://plausible.io', 'HTTPS'],
    ['https://user:pass@plausible.io', 'credentials'],
    ['https://plausible.io/api', 'origin'],
    ['https://localhost', 'public host'],
    ['https://127.0.0.1', 'public host'],
    ['https://[::1]', 'public host'],
    ['https://0x7f000001', 'public host']
  ])('rejects a non-public base URL: %s', (baseUrl, message) => {
    expect(validatePlausibleBaseUrl(baseUrl)).toContain(message)
  })

  it('accepts Plausible Cloud and public self-hosted HTTPS origins', () => {
    expect(validatePlausibleBaseUrl('https://plausible.io')).toBeNull()
    expect(validatePlausibleBaseUrl('https://stats.example.com:8443/')).toBeNull()
  })

  it('fails closed without the API key and creates no provider', async () => {
    const config = { baseUrl: DEFAULT_PLAUSIBLE_BASE_URL, siteId: 'blog.example.com', timeoutMs: 10_000 }

    await expect(plausibleAnalyticsReportRegistration.checkStatus(config, {})).resolves.toEqual({
      status: 'unavailable',
      error: `Missing ${PLAUSIBLE_API_KEY_SECRET} secret`
    })
    expect(plausibleAnalyticsReportRegistration.createAnalyticsReportProvider?.(config, {})).toBeNull()
  })

  it('probes the Stats API with a single lightweight query and the secret supplied only through env', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(apiResponse()))
    const config = { baseUrl: DEFAULT_PLAUSIBLE_BASE_URL, siteId: 'blog.example.com', timeoutMs: 10_000 }

    await expect(plausibleAnalyticsReportRegistration.checkStatus(config, {
      PLAUSIBLE_API_KEY: 'secret-key',
      fetch
    })).resolves.toEqual({ status: 'active' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body))
    expect(body.pagination).toEqual({ limit: 1, offset: 0 })
    expect(plausibleAnalyticsReportRegistration.publicProjection(config)).toEqual(config)
    expect(JSON.stringify(plausibleAnalyticsReportRegistration.publicProjection(config)))
      .not.toContain('secret-key')
  })

  it('rejects non-routable metadata hostnames for the base URL', () => {
    expect(validatePlausibleBaseUrl('https://metadata.google.internal')).toContain('public host')
    expect(validatePlausibleBaseUrl('https://stats.internal')).toContain('public host')
  })
})
