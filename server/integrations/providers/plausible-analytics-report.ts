import { z } from 'zod'
import ipaddr from 'ipaddr.js'
import { createPlausibleAnalyticsReportProvider } from '../../providers/analytics-report/plausible-analytics-report-provider'
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
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || isNonPublicIpLiteral(hostname)) {
      return 'Plausible base URL must use a public host'
    }
    return null
  } catch {
    return 'Plausible base URL must be a valid HTTPS URL'
  }
}

function buildProvider(config: Record<string, unknown>, env: Record<string, unknown>) {
  const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : DEFAULT_PLAUSIBLE_BASE_URL
  const siteId = typeof config.siteId === 'string' ? config.siteId.trim() : ''
  const apiKey = typeof env[PLAUSIBLE_API_KEY_SECRET] === 'string'
    ? (env[PLAUSIBLE_API_KEY_SECRET] as string).trim()
    : ''
  if (!apiKey || !siteId || validatePlausibleBaseUrl(baseUrl)) return null

  return createPlausibleAnalyticsReportProvider({
    providerKey: PLAUSIBLE_ANALYTICS_REPORT_PROVIDER_KEY,
    baseUrl,
    siteId,
    apiKey,
    timeoutMs: typeof config.timeoutMs === 'number' ? config.timeoutMs : 10_000,
    fetchImpl: typeof env.fetch === 'function' ? env.fetch as typeof fetch : undefined
  })
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
    const provider = buildProvider(config, env)
    if (!provider) return { status: 'misconfigured', error: 'Plausible Analytics Report configuration is invalid' }
    try {
      await provider.fetchReport()
      return { status: 'active' }
    } catch {
      return { status: 'unavailable', error: 'Plausible Stats API probe failed' }
    }
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
