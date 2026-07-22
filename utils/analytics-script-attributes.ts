const RESERVED_SCRIPT_ATTRIBUTES = new Set([
  'src',
  'key',
  'async',
  'defer',
  'type',
  'innerhtml',
  'textcontent',
  'children',
  'nonce',
  'data-cf-beacon',
  'data-website-id',
  'data-domain'
])

const REFERRER_POLICIES = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url'
])

const INTEGRITY_PATTERN = /^(?:sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2})(?:\s+sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2})*$/

function primitiveAttributeValue(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return null
}

/**
 * Allows explicit external-script metadata only. Execution flags, source, Nuxt identity, inline
 * content, CSP nonces, and provider identity attributes remain renderer-owned.
 */
export function sanitizeAnalyticsScriptAttributes(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const attributes: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.toLowerCase()
    if (RESERVED_SCRIPT_ATTRIBUTES.has(key)) {
      continue
    }

    if (/^data-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) {
      const normalized = primitiveAttributeValue(rawValue)
      if (normalized !== null) {
        attributes[key] = normalized
      }
      continue
    }

    if (key === 'crossorigin' && (rawValue === 'anonymous' || rawValue === 'use-credentials')) {
      attributes[key] = rawValue
      continue
    }

    if (key === 'referrerpolicy' && typeof rawValue === 'string' && REFERRER_POLICIES.has(rawValue)) {
      attributes[key] = rawValue
      continue
    }

    if (key === 'integrity' && typeof rawValue === 'string' && INTEGRITY_PATTERN.test(rawValue)) {
      attributes[key] = rawValue
    }
  }
  return attributes
}
