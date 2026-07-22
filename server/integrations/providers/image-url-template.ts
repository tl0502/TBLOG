import { z } from 'zod'
import type { ProviderRegistration } from '../registry'

export const IMAGE_URL_TEMPLATE_PROVIDER_KEY = 'url-template'

/** Placeholder every template must contain; the frontend expands it with the percent-encoded source URL. */
const PLACEHOLDER = '{url}'

const TEMPLATE_KEYS = ['thumbnail', 'medium', 'large'] as const

const templateSchema = z.string().trim().min(1).max(2048).optional()

const configSchema = z
  .object({
    thumbnail: templateSchema,
    medium: templateSchema,
    large: templateSchema
  })
  .strip()

/**
 * Image URL templates. A public, secret-free provider: each named template is a URL pattern containing
 * the `{url}` placeholder (and optionally `{width}`/`{height}`). `{url}` expands to the percent-encoded
 * source URL so query strings, signatures, Unicode, and commas remain one provider parameter. Image
 * traffic stays browser-to-provider; no binding or server adapter is involved.
 */
export const imageUrlTemplateRegistration: ProviderRegistration = {
  capability: 'image',
  providerKey: IMAGE_URL_TEMPLATE_PROVIDER_KEY,
  displayName: 'Image URL Templates',
  configSchema,
  validate(config) {
    for (const key of TEMPLATE_KEYS) {
      const value = config[key]
      if (typeof value === 'string' && !value.includes(PLACEHOLDER)) {
        return `The ${key} template must include the ${PLACEHOLDER} placeholder`
      }
    }
    return null
  },
  checkStatus(config) {
    const configured = TEMPLATE_KEYS.some(
      (key) => typeof config[key] === 'string' && (config[key] as string).length > 0
    )
    if (!configured) {
      return { status: 'misconfigured', error: 'Set at least one image URL template' }
    }
    return { status: 'active' }
  },
  publicProjection(config) {
    return {
      thumbnail: (config.thumbnail as string | undefined) ?? null,
      medium: (config.medium as string | undefined) ?? null,
      large: (config.large as string | undefined) ?? null
    }
  },
  requiredSecrets: [],
  requiredBindings: [],
  formMeta: TEMPLATE_KEYS.map((key) => ({
    key,
    label: `${key[0].toUpperCase()}${key.slice(1)} template`,
    type: 'text' as const,
    placeholder: 'https://img.example.com/cdn-cgi/image/width=480/{url}',
    help: `URL template for the ${key} variant. Must include ${PLACEHOLDER}, which receives the percent-encoded source URL.`,
    required: false
  })),
  actions: [{ key: 'test', label: 'Check status' }]
}
