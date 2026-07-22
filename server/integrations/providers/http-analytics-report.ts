import { z } from 'zod'
import ipaddr from 'ipaddr.js'
import { createHttpAnalyticsReportProvider } from '../../providers/analytics-report/http-analytics-report-provider'
import type { ProviderRegistration } from '../registry'

export const HTTP_ANALYTICS_REPORT_PROVIDER_KEY = 'http-analytics-report'
export const ANALYTICS_REPORT_TOKEN_SECRET = 'ANALYTICS_REPORT_TOKEN'

const configSchema = z.object({
  endpoint: z.string().trim().url().max(2048),
  siteId: z.string().trim().min(1).max(512).nullable().optional().default(null),
  timeoutMs: z.coerce.number().int().min(1_000).max(30_000).optional().default(10_000)
}).strip()

function isNonPublicIpLiteral(hostname: string): boolean {
  if (!ipaddr.isValid(hostname)) return false
  return ipaddr.parse(hostname).range() !== 'unicast'
}

export function validateAnalyticsReportEndpoint(value: unknown): string | null {
  try {
    const url = new URL(String(value))
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
    if (url.protocol !== 'https:') return 'Analytics report endpoint must use HTTPS'
    if (url.username || url.password || url.hash) return 'Analytics report endpoint must not contain credentials or fragments'
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || isNonPublicIpLiteral(hostname)) {
      return 'Analytics report endpoint must use a public host'
    }
    return null
  } catch {
    return 'Analytics report endpoint must be a valid HTTPS URL'
  }
}

function buildProvider(config: Record<string, unknown>, env: Record<string, unknown>) {
  const endpoint = typeof config.endpoint === 'string' ? config.endpoint : ''
  const token = typeof env[ANALYTICS_REPORT_TOKEN_SECRET] === 'string'
    ? (env[ANALYTICS_REPORT_TOKEN_SECRET] as string).trim()
    : ''
  if (!token || validateAnalyticsReportEndpoint(endpoint)) return null
  return createHttpAnalyticsReportProvider({
    providerKey: HTTP_ANALYTICS_REPORT_PROVIDER_KEY,
    endpoint,
    token,
    siteId: typeof config.siteId === 'string' ? config.siteId : null,
    timeoutMs: typeof config.timeoutMs === 'number' ? config.timeoutMs : 10_000,
    fetchImpl: typeof env.fetch === 'function' ? env.fetch as typeof fetch : undefined
  })
}

export const httpAnalyticsReportRegistration: ProviderRegistration = {
  capability: 'analyticsReport',
  providerKey: HTTP_ANALYTICS_REPORT_PROVIDER_KEY,
  displayName: 'HTTP Published Analytics Report',
  configSchema,
  validate(config) { return validateAnalyticsReportEndpoint(config.endpoint) },
  async checkStatus(config, env) {
    if (typeof env[ANALYTICS_REPORT_TOKEN_SECRET] !== 'string'
      || !(env[ANALYTICS_REPORT_TOKEN_SECRET] as string).trim()) {
      return { status: 'unavailable', error: `Missing ${ANALYTICS_REPORT_TOKEN_SECRET} secret` }
    }
    const provider = buildProvider(config, env)
    if (!provider) return { status: 'misconfigured', error: 'Analytics report endpoint is invalid' }
    try {
      await provider.fetchReport()
      return { status: 'active' }
    } catch {
      return { status: 'unavailable', error: 'Analytics report endpoint probe failed' }
    }
  },
  publicProjection(config) {
    return {
      endpoint: (config.endpoint as string | undefined) ?? null,
      siteId: (config.siteId as string | null | undefined) ?? null,
      timeoutMs: (config.timeoutMs as number | undefined) ?? 10_000
    }
  },
  requiredSecrets: [ANALYTICS_REPORT_TOKEN_SECRET],
  requiredBindings: [],
  formMeta: [
    { key: 'endpoint', label: 'Published report endpoint', type: 'url', placeholder: 'https://analytics.example.com/tblog/report', help: 'HTTPS endpoint implementing the bounded TBLOG published-report protocol.', required: true },
    { key: 'siteId', label: 'Site ID', type: 'text', placeholder: 'optional-site-id', help: 'Optional site identifier sent as a query parameter.', required: false },
    { key: 'timeoutMs', label: 'Timeout (ms)', type: 'text', placeholder: '10000', help: 'Server-side report request timeout between 1000 and 30000 milliseconds.', required: true }
  ],
  actions: [{ key: 'test', label: 'Check status' }],
  createAnalyticsReportProvider(config, env) { return buildProvider(config, env) }
}
