import ipaddr from 'ipaddr.js'
import { z } from 'zod'
import {
  createUmamiAnalyticsReportProvider,
  probeUmamiAnalyticsReport,
  type UmamiAnalyticsRequestOptions,
  type UmamiAuthMode
} from '../../providers/analytics-report/umami-analytics-report-provider'
import type { ProviderRegistration } from '../registry'

const UMAMI_ANALYTICS_REPORT_PROVIDER_KEY = 'umami'
export const UMAMI_API_TOKEN_SECRET = 'UMAMI_API_TOKEN'
export const UMAMI_SELF_HOSTED_CREDENTIAL_SECRET = 'UMAMI_SELF_HOSTED_CREDENTIAL'
export const UMAMI_CLOUD_API_BASE_URL = 'https://api.umami.is/v1'

const configSchema = z.object({
  apiBaseUrl: z.string().trim().url().max(2_048).optional().default(UMAMI_CLOUD_API_BASE_URL),
  websiteId: z.string().trim().min(1).max(512).optional(),
  authMode: z.enum(['apiKey', 'bearer']).optional().default('apiKey'),
  timeoutMs: z.coerce.number().int().min(1_000).max(30_000).optional().default(10_000)
}).strip()

const selfHostedCredentialSchema = z.object({
  apiBaseUrl: z.string().trim().url().max(2_048),
  token: z.string().trim().min(1).max(16_384)
}).strict()

function isNonPublicIpLiteral(hostname: string): boolean {
  if (!ipaddr.isValid(hostname)) return false
  return ipaddr.parse(hostname).range() !== 'unicast'
}

export function validateUmamiApiBaseUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value))
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
    if (url.protocol !== 'https:') return 'Umami API base URL must use HTTPS'
    if (url.username || url.password || url.search || url.hash) {
      return 'Umami API base URL must not contain credentials, query parameters, or fragments'
    }
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || isNonPublicIpLiteral(hostname)) {
      return 'Umami API base URL must use a public host'
    }
    return null
  } catch {
    return 'Umami API base URL must be a valid HTTPS URL'
  }
}

function canonicalApiBaseUrl(value: string): string {
  const url = new URL(value)
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}

function validateUmamiConfiguration(config: Record<string, unknown>): string | null {
  const apiBaseUrl = typeof config.apiBaseUrl === 'string'
    ? config.apiBaseUrl
    : UMAMI_CLOUD_API_BASE_URL
  const baseUrlError = validateUmamiApiBaseUrl(apiBaseUrl)
  if (baseUrlError) return baseUrlError

  const isCloudHost = new URL(apiBaseUrl).origin === 'https://api.umami.is'
  if (config.authMode === 'bearer' && isCloudHost) {
    return 'Self-hosted Bearer authentication must not use the Umami Cloud API host'
  }
  if (config.authMode !== 'bearer' && !isCloudHost) {
    return 'Umami Cloud API key authentication must use https://api.umami.is'
  }
  return null
}

function requiredSecret(config: Record<string, unknown>): string {
  return config.authMode === 'bearer'
    ? UMAMI_SELF_HOSTED_CREDENTIAL_SECRET
    : UMAMI_API_TOKEN_SECRET
}

type ResolvedProviderOptions =
  | {
      ok: true
      options: Parameters<typeof createUmamiAnalyticsReportProvider>[0]
    }
  | {
      ok: false
      status: 'misconfigured' | 'unavailable'
      error: string
    }

type ResolvedCredential =
  | {
      ok: true
      credential: Pick<UmamiAnalyticsRequestOptions,
        'apiBaseUrl' | 'token' | 'authMode' | 'timeoutMs' | 'fetchImpl'>
    }
  | Exclude<ResolvedProviderOptions, { ok: true }>

function resolveCredential(
  config: Record<string, unknown>,
  env: Record<string, unknown>
): ResolvedCredential {
  const apiBaseUrl = typeof config.apiBaseUrl === 'string'
    ? config.apiBaseUrl
    : UMAMI_CLOUD_API_BASE_URL
  const authMode: UmamiAuthMode = config.authMode === 'bearer' ? 'bearer' : 'apiKey'
  const configurationError = validateUmamiConfiguration({ ...config, apiBaseUrl, authMode })
  if (configurationError) {
    return { ok: false, status: 'misconfigured', error: configurationError }
  }

  let token = ''
  if (authMode === 'apiKey') {
    token = typeof env[UMAMI_API_TOKEN_SECRET] === 'string'
      ? (env[UMAMI_API_TOKEN_SECRET] as string).trim()
      : ''
    if (!token) {
      return { ok: false, status: 'unavailable', error: `Missing ${UMAMI_API_TOKEN_SECRET} secret` }
    }
  } else {
    const rawCredential = typeof env[UMAMI_SELF_HOSTED_CREDENTIAL_SECRET] === 'string'
      ? (env[UMAMI_SELF_HOSTED_CREDENTIAL_SECRET] as string).trim()
      : ''
    if (!rawCredential) {
      return {
        ok: false,
        status: 'unavailable',
        error: `Missing ${UMAMI_SELF_HOSTED_CREDENTIAL_SECRET} secret`
      }
    }

    let credential: unknown
    try {
      credential = JSON.parse(rawCredential)
    } catch {
      return {
        ok: false,
        status: 'misconfigured',
        error: `${UMAMI_SELF_HOSTED_CREDENTIAL_SECRET} must be valid JSON`
      }
    }
    const parsed = selfHostedCredentialSchema.safeParse(credential)
    if (!parsed.success) {
      return {
        ok: false,
        status: 'misconfigured',
        error: `${UMAMI_SELF_HOSTED_CREDENTIAL_SECRET} must contain only a valid apiBaseUrl and token`
      }
    }
    if (validateUmamiApiBaseUrl(parsed.data.apiBaseUrl)) {
      return {
        ok: false,
        status: 'misconfigured',
        error: `${UMAMI_SELF_HOSTED_CREDENTIAL_SECRET} must contain a valid apiBaseUrl and token`
      }
    }
    if (canonicalApiBaseUrl(parsed.data.apiBaseUrl) !== canonicalApiBaseUrl(apiBaseUrl)) {
      return {
        ok: false,
        status: 'misconfigured',
        error: `${UMAMI_SELF_HOSTED_CREDENTIAL_SECRET} apiBaseUrl does not match the configured Umami API base URL`
      }
    }
    token = parsed.data.token
  }

  return {
    ok: true,
    credential: {
      apiBaseUrl,
      token,
      authMode,
      timeoutMs: typeof config.timeoutMs === 'number' ? config.timeoutMs : 10_000,
      fetchImpl: typeof env.fetch === 'function' ? env.fetch as typeof fetch : undefined
    }
  }
}

function resolveProviderOptions(
  config: Record<string, unknown>,
  env: Record<string, unknown>
): ResolvedProviderOptions {
  const websiteId = typeof config.websiteId === 'string' ? config.websiteId.trim() : ''
  if (!websiteId) {
    return { ok: false, status: 'misconfigured', error: 'Umami Website ID is required' }
  }
  const resolved = resolveCredential(config, env)
  if (!resolved.ok) return resolved
  return {
    ok: true,
    options: {
      providerKey: UMAMI_ANALYTICS_REPORT_PROVIDER_KEY,
      websiteId,
      ...resolved.credential
    }
  }
}

function buildProvider(config: Record<string, unknown>, env: Record<string, unknown>) {
  const resolved = resolveProviderOptions(config, env)
  return resolved.ok ? createUmamiAnalyticsReportProvider(resolved.options) : null
}

function probeError(result: Exclude<Awaited<ReturnType<typeof probeUmamiAnalyticsReport>>, { ok: true }>) {
  switch (result.reason) {
    case 'authentication':
      return 'Umami authentication or website access failed (HTTP 401); verify auth mode, credential, Website ID, and account permissions'
    case 'permission':
      return 'Umami or its upstream access policy denied the request (HTTP 403)'
    case 'notFound':
      return 'Umami website or /metrics/expanded endpoint was not found (HTTP 404)'
    case 'rateLimited':
      return 'Umami rate limit exceeded (HTTP 429); retry later'
    case 'incompatible':
      return `Umami rejected the metrics probe (HTTP ${result.statusCode}); verify version and API base URL`
    case 'redirect':
      return `Umami metrics endpoint returned a redirect (HTTP ${result.statusCode}); use the final public HTTPS API base URL`
    case 'upstream':
      return `Umami service is unavailable (HTTP ${result.statusCode})`
    case 'invalidResponse':
      return 'Umami metrics response is invalid or exceeds report limits'
    case 'timeout':
      return 'Umami metrics probe timed out'
    case 'network':
      return 'Unable to reach Umami over public HTTPS; verify DNS, TLS, and redirect configuration'
  }
}

export const umamiAnalyticsReportRegistration: ProviderRegistration = {
  capability: 'analyticsReport',
  providerKey: UMAMI_ANALYTICS_REPORT_PROVIDER_KEY,
  displayName: 'Umami Analytics Report',
  configSchema,
  validate(config) { return validateUmamiConfiguration(config) },
  async checkStatus(config, env) {
    const resolved = resolveProviderOptions(config, env)
    if (!resolved.ok) return { status: resolved.status, error: resolved.error }
    const result = await probeUmamiAnalyticsReport(resolved.options)
    return result.ok
      ? { status: 'active' }
      : { status: 'unavailable', error: probeError(result) }
  },
  publicProjection(config) {
    return {
      apiBaseUrl: (config.apiBaseUrl as string | undefined) ?? UMAMI_CLOUD_API_BASE_URL,
      websiteId: (config.websiteId as string | undefined) ?? null,
      authMode: config.authMode === 'bearer' ? 'bearer' : 'apiKey',
      timeoutMs: (config.timeoutMs as number | undefined) ?? 10_000
    }
  },
  resolveRequiredSecrets(config) { return [requiredSecret(config)] },
  requiredSecrets: [UMAMI_API_TOKEN_SECRET, UMAMI_SELF_HOSTED_CREDENTIAL_SECRET],
  requiredBindings: [],
  formMeta: [
    { key: 'apiBaseUrl', label: 'Umami API base URL', type: 'url', placeholder: UMAMI_CLOUD_API_BASE_URL, help: 'Cloud API key mode is restricted to api.umami.is. A self-hosted HTTPS base must exactly match the apiBaseUrl embedded in UMAMI_SELF_HOSTED_CREDENTIAL.', required: false },
    { key: 'authMode', label: 'Authentication mode', type: 'select', help: 'Cloud uses UMAMI_API_TOKEN. Self-hosted mode uses a target-bound UMAMI_SELF_HOSTED_CREDENTIAL JSON secret containing apiBaseUrl and token.', required: false, options: [{ value: 'apiKey', label: 'Umami Cloud API key' }, { value: 'bearer', label: 'Self-hosted Bearer token' }] },
    { key: 'credentialUsername', label: 'Temporary Umami username', type: 'text', help: 'Used only by this browser to request a self-hosted token. It is not saved in TBLOG.', required: false, persist: false, visibleWhen: { key: 'authMode', value: 'bearer' } },
    { key: 'credentialPassword', label: 'Temporary Umami password', type: 'password', help: 'Sent directly from this browser to Umami over HTTPS. It does not pass through the TBLOG server.', required: false, persist: false, visibleWhen: { key: 'authMode', value: 'bearer' } },
    { key: 'websiteId', label: 'Umami Website ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', help: 'Copy the stable Website ID from the self-hosted Umami website settings, then save and check status to verify access.', required: true },
    { key: 'timeoutMs', label: 'Timeout (ms)', type: 'text', placeholder: '10000', help: 'Server-side request timeout between 1000 and 30000 milliseconds.', required: false }
  ],
  actions: [
    { key: 'generateCredential', label: 'Generate self-hosted credential', kind: 'client', clientHandler: 'umamiSelfHostedCredential', visibleWhen: { key: 'authMode', value: 'bearer' } },
    { key: 'test', label: 'Check status' }
  ],
  createAnalyticsReportProvider(config, env) { return buildProvider(config, env) }
}
