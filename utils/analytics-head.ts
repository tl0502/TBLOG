import type { PublicAnalyticsConfig } from '~/types/public-view'
import { sanitizeAnalyticsScriptAttributes } from './analytics-script-attributes'

/** Build the `useHead` script entries for a canonical frontend-direct analytics provider. */
export interface AnalyticsScriptEntry {
  key: string
  src: string
  async?: boolean
  defer?: boolean
  [attribute: string]: string | boolean | undefined
}

export interface AnalyticsHead {
  script: AnalyticsScriptEntry[]
}

const CLOUDFLARE_BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'
const ANALYTICS_KEY = 'tblog-analytics'

function httpScriptUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function buildAnalyticsHead(analytics: PublicAnalyticsConfig | undefined | null): AnalyticsHead {
  if (!analytics || !analytics.enabled) {
    return { script: [] }
  }

  const provider = (analytics.providerKey ?? '').toLowerCase()

  // Retired and unknown provider keys never inherit custom-script behavior.
  if (provider === 'native') {
    return { script: [] }
  }

  const renderConfig = sanitizeAnalyticsScriptAttributes(analytics.renderConfig ?? {})
  const scriptUrl = httpScriptUrl(analytics.scriptUrl)
  const siteId = nonEmptyString(analytics.siteId)

  if (provider === 'cloudflare-web-analytics') {
    if (!siteId) {
      return { script: [] }
    }
    return {
      script: [
        {
          key: ANALYTICS_KEY,
          src: CLOUDFLARE_BEACON_SRC,
          defer: true,
          'data-cf-beacon': JSON.stringify({ token: siteId })
        }
      ]
    }
  }

  if (provider === 'umami') {
    if (!scriptUrl || !siteId) {
      return { script: [] }
    }
    return {
      script: [
        {
          ...renderConfig,
          key: ANALYTICS_KEY,
          src: scriptUrl,
          defer: true,
          'data-website-id': siteId
        }
      ]
    }
  }

  if (provider === 'plausible') {
    if (!scriptUrl || !siteId) {
      return { script: [] }
    }
    return {
      script: [
        {
          ...renderConfig,
          key: ANALYTICS_KEY,
          src: scriptUrl,
          async: true,
          'data-domain': siteId
        }
      ]
    }
  }

  if (provider === 'custom') {
    if (!scriptUrl) {
      return { script: [] }
    }
    return {
      script: [
        {
          ...renderConfig,
          key: ANALYTICS_KEY,
          src: scriptUrl,
          async: true
        }
      ]
    }
  }

  // Unknown registrations never inherit custom-script behavior.
  return { script: [] }
}
