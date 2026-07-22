import { z } from 'zod'
import { sanitizeAnalyticsScriptAttributes } from '../../../utils/analytics-script-attributes'
import type { ProviderRegistration } from '../registry'

const CLOUDFLARE_WEB_ANALYTICS_PROVIDER_KEY = 'cloudflare-web-analytics'
const UMAMI_ANALYTICS_PROVIDER_KEY = 'umami'
const PLAUSIBLE_ANALYTICS_PROVIDER_KEY = 'plausible'
const CUSTOM_ANALYTICS_PROVIDER_KEY = 'custom'

const DEFAULT_UMAMI_SCRIPT_URL = 'https://cloud.umami.is/script.js'
const DEFAULT_PLAUSIBLE_SCRIPT_URL = 'https://plausible.io/js/script.js'
const MAX_SCRIPT_URL_LENGTH = 2_048
const MAX_RENDER_CONFIG_JSON_LENGTH = 8_192

const scriptUrlSchema = z.string().trim().url().max(MAX_SCRIPT_URL_LENGTH).optional()
const siteIdSchema = z.string().trim().min(1).max(512).optional()
const renderConfigSchema = z.record(z.string(), z.unknown()).optional()
const renderConfigJsonSchema = z.string().trim().max(MAX_RENDER_CONFIG_JSON_LENGTH).optional()

interface AnalyticsProviderPublicProjection {
  [key: string]: unknown
  scriptUrl: string | null
  siteId: string | null
  renderConfig: Record<string, string>
  /** Registry form compatibility; public site-config must select only the standardized fields above. */
  renderConfigJson?: string
}

function parseRenderConfigJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

/** Normalizes either migrated `renderConfig` or the registry form's JSON text field. */
function normalizeAnalyticsRenderConfig(config: Record<string, unknown>): Record<string, string> {
  const fromJson = parseRenderConfigJson(config.renderConfigJson)
  return sanitizeAnalyticsScriptAttributes(fromJson ?? config.renderConfig)
}

function editableRenderConfigJson(config: Record<string, unknown>, renderConfig: Record<string, string>): string {
  if (Object.keys(renderConfig).length > 0 || config.renderConfigJson || config.renderConfig) {
    return JSON.stringify(renderConfig)
  }
  return ''
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function projectScriptProvider(
  config: Record<string, unknown>,
  options: {
    defaultScriptUrl?: string
    includeSiteId: boolean
    includeRenderConfigEditor: boolean
  }
): AnalyticsProviderPublicProjection {
  const renderConfig = normalizeAnalyticsRenderConfig(config)
  const projection: AnalyticsProviderPublicProjection = {
    scriptUrl: stringOrNull(config.scriptUrl) ?? options.defaultScriptUrl ?? null,
    siteId: options.includeSiteId ? stringOrNull(config.siteId) : null,
    renderConfig
  }
  if (options.includeRenderConfigEditor) {
    projection.renderConfigJson = editableRenderConfigJson(config, renderConfig)
  }
  return projection
}

function validateHttpsScriptUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      ? null
      : 'Analytics script URL must use HTTPS'
  } catch {
    return 'Analytics script URL must be a valid URL'
  }
}

function validateRenderConfigJson(config: Record<string, unknown>): string | null {
  if (config.renderConfigJson === undefined) {
    return null
  }
  return parseRenderConfigJson(config.renderConfigJson)
    ? null
    : 'Script attributes must be a JSON object'
}

function scriptProviderValidation(config: Record<string, unknown>): string | null {
  return validateHttpsScriptUrl(config.scriptUrl) ?? validateRenderConfigJson(config)
}

function scriptProviderStatus(
  config: Record<string, unknown>,
  options: { defaultScriptUrl?: string; requireSiteId: boolean }
) {
  const scriptUrl = stringOrNull(config.scriptUrl) ?? options.defaultScriptUrl ?? null
  if (!scriptUrl) {
    return { status: 'misconfigured' as const, error: 'Analytics script URL is not set' }
  }
  const urlError = validateHttpsScriptUrl(scriptUrl)
  if (urlError) {
    return { status: 'misconfigured' as const, error: urlError }
  }
  if (options.requireSiteId && !stringOrNull(config.siteId)) {
    return { status: 'misconfigured' as const, error: 'Analytics site identifier is not set' }
  }
  const renderConfigError = validateRenderConfigJson(config)
  if (renderConfigError) {
    return { status: 'misconfigured' as const, error: renderConfigError }
  }
  return { status: 'active' as const }
}

const renderConfigFormField = {
  key: 'renderConfigJson',
  label: 'Extra script attributes (JSON)',
  type: 'text' as const,
  placeholder: '{"data-host-url":"https://analytics.example.com"}',
  help: 'Optional data-* attributes, crossorigin, referrerpolicy, or integrity. Reserved script attributes are omitted.',
  required: false
}

export const cloudflareWebAnalyticsRegistration: ProviderRegistration = {
  capability: 'analytics',
  providerKey: CLOUDFLARE_WEB_ANALYTICS_PROVIDER_KEY,
  displayName: 'Cloudflare Web Analytics',
  configSchema: z.object({ siteId: siteIdSchema }).strip(),
  validate() {
    return null
  },
  checkStatus(config) {
    return stringOrNull(config.siteId)
      ? { status: 'active' }
      : { status: 'misconfigured', error: 'Cloudflare Web Analytics token is not set' }
  },
  publicProjection(config) {
    return { scriptUrl: null, siteId: stringOrNull(config.siteId), renderConfig: {} }
  },
  requiredSecrets: [],
  requiredBindings: [],
  formMeta: [
    {
      key: 'siteId',
      label: 'Site token',
      type: 'text',
      placeholder: 'Cloudflare Web Analytics token',
      help: 'Public site token embedded in the Cloudflare beacon script.',
      required: true
    }
  ],
  actions: [{ key: 'test', label: 'Validate configuration' }]
}

export const umamiAnalyticsRegistration: ProviderRegistration = {
  capability: 'analytics',
  providerKey: UMAMI_ANALYTICS_PROVIDER_KEY,
  displayName: 'Umami',
  configSchema: z.object({
    scriptUrl: scriptUrlSchema,
    siteId: siteIdSchema,
    renderConfig: renderConfigSchema,
    renderConfigJson: renderConfigJsonSchema
  }).strip(),
  validate: scriptProviderValidation,
  checkStatus(config) {
    return scriptProviderStatus(config, { defaultScriptUrl: DEFAULT_UMAMI_SCRIPT_URL, requireSiteId: true })
  },
  publicProjection(config) {
    return projectScriptProvider(config, {
      defaultScriptUrl: DEFAULT_UMAMI_SCRIPT_URL,
      includeSiteId: true,
      includeRenderConfigEditor: true
    })
  },
  requiredSecrets: [],
  requiredBindings: [],
  formMeta: [
    {
      key: 'scriptUrl',
      label: 'Script URL',
      type: 'url',
      placeholder: DEFAULT_UMAMI_SCRIPT_URL,
      help: 'Umami browser analytics script URL.',
      required: true
    },
    {
      key: 'siteId',
      label: 'Website ID',
      type: 'text',
      help: 'Public Umami website identifier.',
      required: true
    },
    renderConfigFormField
  ],
  actions: [{ key: 'test', label: 'Validate configuration' }]
}

export const plausibleAnalyticsRegistration: ProviderRegistration = {
  capability: 'analytics',
  providerKey: PLAUSIBLE_ANALYTICS_PROVIDER_KEY,
  displayName: 'Plausible',
  configSchema: z.object({
    scriptUrl: scriptUrlSchema,
    siteId: siteIdSchema,
    renderConfig: renderConfigSchema,
    renderConfigJson: renderConfigJsonSchema
  }).strip(),
  validate: scriptProviderValidation,
  checkStatus(config) {
    return scriptProviderStatus(config, { defaultScriptUrl: DEFAULT_PLAUSIBLE_SCRIPT_URL, requireSiteId: true })
  },
  publicProjection(config) {
    return projectScriptProvider(config, {
      defaultScriptUrl: DEFAULT_PLAUSIBLE_SCRIPT_URL,
      includeSiteId: true,
      includeRenderConfigEditor: true
    })
  },
  requiredSecrets: [],
  requiredBindings: [],
  formMeta: [
    {
      key: 'scriptUrl',
      label: 'Script URL',
      type: 'url',
      placeholder: DEFAULT_PLAUSIBLE_SCRIPT_URL,
      help: 'Plausible browser analytics script URL.',
      required: true
    },
    {
      key: 'siteId',
      label: 'Domain',
      type: 'text',
      placeholder: 'blog.example.com',
      help: 'Public domain identifier measured by Plausible.',
      required: true
    },
    renderConfigFormField
  ],
  actions: [{ key: 'test', label: 'Validate configuration' }]
}

export const customAnalyticsRegistration: ProviderRegistration = {
  capability: 'analytics',
  providerKey: CUSTOM_ANALYTICS_PROVIDER_KEY,
  displayName: 'Custom Analytics Script',
  configSchema: z.object({
    scriptUrl: scriptUrlSchema,
    renderConfig: renderConfigSchema,
    renderConfigJson: renderConfigJsonSchema
  }).strip(),
  validate: scriptProviderValidation,
  checkStatus(config) {
    return scriptProviderStatus(config, { requireSiteId: false })
  },
  publicProjection(config) {
    return projectScriptProvider(config, { includeSiteId: false, includeRenderConfigEditor: true })
  },
  requiredSecrets: [],
  requiredBindings: [],
  formMeta: [
    {
      key: 'scriptUrl',
      label: 'Script URL',
      type: 'url',
      placeholder: 'https://analytics.example.com/script.js',
      help: 'Public HTTPS script loaded directly by the visitor browser.',
      required: true
    },
    renderConfigFormField
  ],
  actions: [{ key: 'test', label: 'Validate configuration' }]
}

export const analyticsRegistrations: readonly ProviderRegistration[] = [
  cloudflareWebAnalyticsRegistration,
  umamiAnalyticsRegistration,
  plausibleAnalyticsRegistration,
  customAnalyticsRegistration
]
