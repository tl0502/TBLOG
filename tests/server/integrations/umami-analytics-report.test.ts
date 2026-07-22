import { describe, expect, it, vi } from 'vitest'
import {
  UMAMI_API_TOKEN_SECRET,
  UMAMI_CLOUD_API_BASE_URL,
  UMAMI_SELF_HOSTED_CREDENTIAL_SECRET,
  umamiAnalyticsReportRegistration,
  validateUmamiApiBaseUrl
} from '../../../server/integrations/providers/umami-analytics-report'

const selfHostedApiBaseUrl = 'https://umami.example.com/api'

function selfHostedCredential(
  apiBaseUrl = selfHostedApiBaseUrl,
  token = 'secret-token'
) {
  return JSON.stringify({ apiBaseUrl, token })
}

describe('Umami analytics report registration', () => {
  it('validates only public HTTPS API base URLs', () => {
    expect(validateUmamiApiBaseUrl(UMAMI_CLOUD_API_BASE_URL)).toBeNull()
    expect(validateUmamiApiBaseUrl('https://umami.example.com/api')).toBeNull()
    expect(validateUmamiApiBaseUrl('http://umami.example.com/api')).toContain('HTTPS')
    expect(validateUmamiApiBaseUrl('https://user:pass@umami.example.com/api')).toContain('credentials')
    expect(validateUmamiApiBaseUrl('https://127.0.0.1/api')).toContain('public host')
    expect(validateUmamiApiBaseUrl('https://[::ffff:127.0.0.1]/api')).toContain('public host')
  })

  it('keeps the token outside parsed and public configuration', () => {
    const config = umamiAnalyticsReportRegistration.configSchema.parse({
      websiteId: 'website-id',
      UMAMI_API_TOKEN: 'must-not-persist',
      UMAMI_SELF_HOSTED_CREDENTIAL: 'must-not-persist'
    }) as Record<string, unknown>

    expect(config).toEqual({
      apiBaseUrl: UMAMI_CLOUD_API_BASE_URL,
      websiteId: 'website-id',
      authMode: 'apiKey',
      timeoutMs: 10_000
    })
    expect(umamiAnalyticsReportRegistration.publicProjection(config)).toEqual(config)
    expect(umamiAnalyticsReportRegistration.requiredSecrets).toEqual([
      UMAMI_API_TOKEN_SECRET,
      UMAMI_SELF_HOSTED_CREDENTIAL_SECRET
    ])
    expect(umamiAnalyticsReportRegistration.resolveRequiredSecrets?.(config))
      .toEqual([UMAMI_API_TOKEN_SECRET])
    expect(umamiAnalyticsReportRegistration.resolveRequiredSecrets?.({ ...config, authMode: 'bearer' }))
      .toEqual([UMAMI_SELF_HOSTED_CREDENTIAL_SECRET])
    expect(umamiAnalyticsReportRegistration.providerKey).toBe('umami')
    expect(umamiAnalyticsReportRegistration.formMeta
      .filter((field) => ['apiBaseUrl', 'authMode', 'timeoutMs'].includes(field.key))
      .every((field) => !field.required)).toBe(true)
    expect(umamiAnalyticsReportRegistration.formMeta
      .find((field) => field.key === 'websiteId')?.required).toBe(true)
    expect(umamiAnalyticsReportRegistration.formMeta
      .find((field) => field.key === 'websiteId')?.type).toBe('text')
    expect(umamiAnalyticsReportRegistration.actions).toContainEqual({
      key: 'generateCredential',
      label: 'Generate self-hosted credential',
      kind: 'client',
      clientHandler: 'umamiSelfHostedCredential',
      visibleWhen: { key: 'authMode', value: 'bearer' }
    })
    expect(umamiAnalyticsReportRegistration.formMeta
      .filter((field) => field.key.startsWith('credential'))
      .every((field) => field.persist === false)).toBe(true)
  })

  it('binds each authentication mode to its intended Umami target', () => {
    expect(umamiAnalyticsReportRegistration.validate({
      apiBaseUrl: UMAMI_CLOUD_API_BASE_URL,
      authMode: 'apiKey'
    })).toBeNull()
    expect(umamiAnalyticsReportRegistration.validate({
      apiBaseUrl: selfHostedApiBaseUrl,
      authMode: 'apiKey'
    })).toContain('must use https://api.umami.is')
    expect(umamiAnalyticsReportRegistration.validate({
      apiBaseUrl: UMAMI_CLOUD_API_BASE_URL,
      authMode: 'bearer'
    })).toContain('must not use the Umami Cloud API host')
  })

  it('requires the secret and runs one lightweight Umami metrics probe', async () => {
    await expect(umamiAnalyticsReportRegistration.checkStatus(
      { apiBaseUrl: UMAMI_CLOUD_API_BASE_URL, websiteId: 'website-id', authMode: 'apiKey' },
      { UMAMI_API_TOKEN: '   ' }
    )).resolves.toEqual({
      status: 'unavailable',
      error: 'Missing UMAMI_API_TOKEN secret'
    })

    const fetch = vi.fn().mockImplementation(async () => new Response('[]', { status: 200 }))
    await expect(umamiAnalyticsReportRegistration.checkStatus(
      { apiBaseUrl: UMAMI_CLOUD_API_BASE_URL, websiteId: 'website-id', authMode: 'apiKey' },
      { UMAMI_API_TOKEN: 'token', fetch }
    )).resolves.toEqual({ status: 'active' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.get('limit')).toBe('1')
  })

  it.each([
    [302, 'Umami metrics endpoint returned a redirect (HTTP 302); use the final public HTTPS API base URL'],
    [401, 'Umami authentication or website access failed (HTTP 401); verify auth mode, credential, Website ID, and account permissions'],
    [403, 'Umami or its upstream access policy denied the request (HTTP 403)'],
    [404, 'Umami website or /metrics/expanded endpoint was not found (HTTP 404)'],
    [429, 'Umami rate limit exceeded (HTTP 429); retry later'],
    [422, 'Umami rejected the metrics probe (HTTP 422); verify version and API base URL'],
    [503, 'Umami service is unavailable (HTTP 503)']
  ] as const)('reports a safe diagnostic for HTTP %s', async (status, error) => {
    const fetch = vi.fn().mockResolvedValue(new Response('secret-token upstream detail', { status }))

    await expect(umamiAnalyticsReportRegistration.checkStatus(
      { apiBaseUrl: selfHostedApiBaseUrl, websiteId: 'website-id', authMode: 'bearer' },
      { UMAMI_SELF_HOSTED_CREDENTIAL: selfHostedCredential(), fetch }
    )).resolves.toEqual({ status: 'unavailable', error })
    expect(error).not.toContain('secret-token')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reports invalid responses and network failures without leaking provider details', async () => {
    const invalid = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(umamiAnalyticsReportRegistration.checkStatus(
      { apiBaseUrl: selfHostedApiBaseUrl, websiteId: 'website-id', authMode: 'bearer' },
      { UMAMI_SELF_HOSTED_CREDENTIAL: selfHostedCredential(), fetch: invalid }
    )).resolves.toEqual({
      status: 'unavailable',
      error: 'Umami metrics response is invalid or exceeds report limits'
    })

    const network = vi.fn().mockRejectedValue(new TypeError('secret-token upstream detail'))
    await expect(umamiAnalyticsReportRegistration.checkStatus(
      { apiBaseUrl: selfHostedApiBaseUrl, websiteId: 'website-id', authMode: 'bearer' },
      { UMAMI_SELF_HOSTED_CREDENTIAL: selfHostedCredential(), fetch: network }
    )).resolves.toEqual({
      status: 'unavailable',
      error: 'Unable to reach Umami over public HTTPS; verify DNS, TLS, and redirect configuration'
    })
  })

  it('rejects malformed or target-mismatched self-hosted credentials before fetch', async () => {
    const fetch = vi.fn()
    const config = {
      apiBaseUrl: selfHostedApiBaseUrl,
      websiteId: 'website-id',
      authMode: 'bearer'
    }

    await expect(umamiAnalyticsReportRegistration.checkStatus(config, {
      UMAMI_SELF_HOSTED_CREDENTIAL: '{not-json',
      fetch
    })).resolves.toEqual({
      status: 'misconfigured',
      error: 'UMAMI_SELF_HOSTED_CREDENTIAL must be valid JSON'
    })
    await expect(umamiAnalyticsReportRegistration.checkStatus(config, {
      UMAMI_SELF_HOSTED_CREDENTIAL: selfHostedCredential('https://other.example.com/api'),
      fetch
    })).resolves.toEqual({
      status: 'misconfigured',
      error: 'UMAMI_SELF_HOSTED_CREDENTIAL apiBaseUrl does not match the configured Umami API base URL'
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
