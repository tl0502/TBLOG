import { z } from 'zod'
import ipaddr from 'ipaddr.js'
import {
  createPlausibleAnalyticsReportProvider,
  probePlausibleAnalyticsReport,
  type PlausibleAnalyticsProbeResult
} from '../../providers/analytics-report/plausible-analytics-report-provider'
import type { ProviderRegistration } from '../registry'

const PLAUSIBLE_ANALYTICS_REPORT_PROVIDER_KEY = 'plausible'
export const PLAUSIBLE_API_KEY_SECRET = 'PLAUSIBLE_API_KEY'
export const DEFAULT_PLAUSIBLE_BASE_URL = 'https://plausible.io'

export const plausibleAnalyticsReportConfigSchema = z.object({
  baseUrl: z.string().trim().url().max(2048).optional().default(DEFAULT_PLAUSIBLE_BASE_URL),
  siteId: z.string().trim().min(1).max(512),
  timeoutMs: z.coerce.number().int().min(1_000).max(30_000).optional().default(10_000)
}).strip()

function isNonPublicIpLiteral(hostname: string): boolean {
  if (!ipaddr.isValid(hostname)) return false
  return ipaddr.parse(hostname).range() !== 'unicast'
}

/** Block localhost, private IP literals, and common non-routable / metadata hostnames. */
function isBlockedOutboundHost(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.intranet')
    || hostname === 'metadata'
    || hostname === 'metadata.google.internal'
    || hostname.endsWith('.metadata.google.internal')
    || hostname === 'kubernetes.default'
    || hostname === 'kubernetes.default.svc'
    || isNonPublicIpLiteral(hostname)
}

export function validatePlausibleBaseUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value))
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
    if (url.protocol !== 'https:') return 'Plausible base URL must use HTTPS'
    if (url.username || url.password || url.search || url.hash) {
      return 'Plausible base URL must not contain credentials, query parameters, or fragments'
    }
    if (url.pathname !== '/' && url.pathname !== '') {
      return 'Plausible base URL must contain only the public origin'
    }
    if (isBlockedOutboundHost(hostname)) {
      return 'Plausible base URL must use a public host'
    }
    return null
  } catch {
    return 'Plausible base URL must be a valid HTTPS URL'
  }
}

function resolveRequestOptions(config: Record<string, unknown>, env: Record<string, unknown>) {
  const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : DEFAULT_PLAUSIBLE_BASE_URL
  const siteId = typeof config.siteId === 'string' ? config.siteId.trim() : ''
  const apiKey = typeof env[PLAUSIBLE_API_KEY_SECRET] === 'string'
    ? (env[PLAUSIBLE_API_KEY_SECRET] as string).trim()
    : ''
  if (!apiKey || !siteId || validatePlausibleBaseUrl(baseUrl)) return null
  return {
    baseUrl,
    siteId,
    apiKey,
    timeoutMs: typeof config.timeoutMs === 'number' ? config.timeoutMs : 10_000,
    fetchImpl: typeof env.fetch === 'function' ? env.fetch as typeof fetch : undefined
  }
}

function buildProvider(config: Record<string, unknown>, env: Record<string, unknown>) {
  const options = resolveRequestOptions(config, env)
  if (!options) return null
  return createPlausibleAnalyticsReportProvider({
    providerKey: PLAUSIBLE_ANALYTICS_REPORT_PROVIDER_KEY,
    ...options
  })
}

function probeError(result: Exclude<PlausibleAnalyticsProbeResult, { ok: true }>): string {
  switch (result.reason) {
    case 'authentication':
      return 'Plausible authentication failed (HTTP 401); verify PLAUSIBLE_API_KEY and site access'
    case 'permission':
      return 'Plausible denied the request (HTTP 403); verify site ID and API key permissions'
    case 'notFound':
      return 'Plausible site or Stats API endpoint was not found (HTTP 404)'
    case 'rateLimited':
      return 'Plausible rate limit exceeded (HTTP 429); retry later'
    case 'upstream':
      return `Plausible service is unavailable (HTTP ${result.statusCode})`
    case 'invalidResponse':
      return 'Plausible Stats API response is invalid or exceeds probe limits'
    case 'timeout':
      return 'Plausible Stats API probe timed out'
    case 'network':
      return 'Unable to reach Plausible over public HTTPS; verify DNS, TLS, and base URL'
  }
}

export const plausibleAnalyticsReportRegistration: ProviderRegistration = {
  capability: 'analyticsReport',
  providerKey: PLAUSIBLE_ANALYTICS_REPORT_PROVIDER_KEY,
  displayName: 'Plausible Analytics Report',
  configSchema: plausibleAnalyticsReportConfigSchema,
  validate(config) {
    return validatePlausibleBaseUrl(config.baseUrl)
  },
  async checkStatus(config, env) {
    if (typeof env[PLAUSIBLE_API_KEY_SECRET] !== 'string'
      || !(env[PLAUSIBLE_API_KEY_SECRET] as string).trim()) {
      return { status: 'unavailable', error: `Missing ${PLAUSIBLE_API_KEY_SECRET} secret` }
    }
    const options = resolveRequestOptions(config, env)
    if (!options) return { status: 'misconfigured', error: 'Plausible Analytics Report configuration is invalid' }
    const result = await probePlausibleAnalyticsReport(options)
    return result.ok
      ? { status: 'active' }
      : { status: 'unavailable', error: probeError(result) }
  },
  publicProjection(config) {
    return {
      baseUrl: (config.baseUrl as string | undefined) ?? DEFAULT_PLAUSIBLE_BASE_URL,
      siteId: (config.siteId as string | undefined) ?? null,
      timeoutMs: (config.timeoutMs as number | undefined) ?? 10_000
    }
  },
  requiredSecrets: [PLAUSIBLE_API_KEY_SECRET],
  requiredBindings: [],
  formMeta: [
    { key: 'baseUrl', label: 'Plausible base URL', type: 'url', placeholder: DEFAULT_PLAUSIBLE_BASE_URL, help: 'Public HTTPS origin for Plausible Cloud or a self-hosted Plausible instance.', required: false },
    { key: 'siteId', label: 'Site ID', type: 'text', placeholder: 'blog.example.com', help: 'Site domain exactly as configured in Plausible.', required: true },
    { key: 'timeoutMs', label: 'Timeout (ms)', type: 'text', placeholder: '10000', help: 'Stats API timeout between 1000 and 30000 milliseconds.', required: false }
  ],
  actions: [{ key: 'test', label: 'Check status' }],
  createAnalyticsReportProvider(config, env) {
    return buildProvider(config, env)
  }
}
