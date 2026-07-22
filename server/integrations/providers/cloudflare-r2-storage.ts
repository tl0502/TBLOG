import { z } from 'zod'
import type { R2BucketLike } from '../../providers/storage/r2-storage-provider'
import type { ProviderRegistration } from '../registry'

export const CLOUDFLARE_R2_STORAGE_PROVIDER_KEY = 'cloudflare-r2'
export const MEDIA_R2_BINDING = 'MEDIA_R2'

/** Keep registry readiness and runtime provider resolution on the same binding contract. */
export function isR2BucketBinding(binding: unknown): binding is R2BucketLike {
  return Boolean(
    binding
    && typeof (binding as R2BucketLike).put === 'function'
    && typeof (binding as R2BucketLike).head === 'function'
    && typeof (binding as R2BucketLike).delete === 'function'
  )
}

function parsePublicBaseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function normalizePublicBaseUrl(value: string): string {
  const url = new URL(value)
  const pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  return `${url.origin}${pathname === '/' ? '' : pathname}`
}

function isSafeKeyPrefix(value: string): boolean {
  const withoutTrailingSlash = value.replace(/\/+$/, '')
  if (!withoutTrailingSlash) return false
  const segments = withoutTrailingSlash.split('/')
  return segments.every(
    (segment) => segment !== '.' && segment !== '..' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)
  )
}

export const cloudflareR2StorageConfigSchema = z
  .object({
    publicBaseUrl: z
      .string()
      .trim()
      .max(2048)
      .superRefine((value, context) => {
        const url = parsePublicBaseUrl(value)
        if (!url || url.protocol !== 'https:' || !url.hostname) {
          context.addIssue({ code: 'custom', message: 'Public base URL must be an https URL' })
          return
        }
        if (url.username || url.password) {
          context.addIssue({ code: 'custom', message: 'Public base URL must not include credentials' })
        }
        if (url.search || url.hash) {
          context.addIssue({ code: 'custom', message: 'Public base URL must not include a query or fragment' })
        }
      })
      .transform(normalizePublicBaseUrl)
      .optional(),
    keyPrefix: z
      .string()
      .trim()
      .max(128)
      .refine(isSafeKeyPrefix, 'Key prefix must contain only safe path segments')
      .transform((value) => `${value.replace(/\/+$/, '')}/`)
      .optional()
  })
  .strip()

export type CloudflareR2StorageConfig = z.infer<typeof cloudflareR2StorageConfigSchema>

export function validateCloudflareR2StorageConfig(config: Record<string, unknown>): string | null {
  const parsed = cloudflareR2StorageConfigSchema.safeParse(config)
  if (parsed.success) return null
  return parsed.error.issues[0]?.message ?? 'Invalid R2 storage configuration'
}

/**
 * Cloudflare R2 storage. Optional upload storage bound as `MEDIA_R2`; public config is the bucket's
 * public base URL and an optional key prefix. R2 write access is the binding itself — no secret is
 * stored. When the binding is absent, uploads stay disabled and external image URL insertion remains
 * the default media model.
 */
export const cloudflareR2StorageRegistration: ProviderRegistration = {
  capability: 'storage',
  providerKey: CLOUDFLARE_R2_STORAGE_PROVIDER_KEY,
  displayName: 'Cloudflare R2 Storage',
  configSchema: cloudflareR2StorageConfigSchema,
  validate: validateCloudflareR2StorageConfig,
  checkStatus(config, env) {
    if (!isR2BucketBinding(env[MEDIA_R2_BINDING])) {
      return { status: 'unavailable', error: `Missing or invalid ${MEDIA_R2_BINDING} binding` }
    }
    const validationError = validateCloudflareR2StorageConfig(config)
    if (validationError) {
      return { status: 'misconfigured', error: validationError }
    }
    if (!config.publicBaseUrl) {
      return { status: 'misconfigured', error: 'Public base URL is not set' }
    }
    // This non-destructive check proves only configuration and binding presence. It intentionally
    // does not claim that the configured custom domain/r2.dev URL is publicly reachable.
    return { status: 'configured' }
  },
  publicProjection(config) {
    return {
      publicBaseUrl: (config.publicBaseUrl as string | undefined) ?? null,
      keyPrefix: (config.keyPrefix as string | undefined) ?? null
    }
  },
  requiredSecrets: [],
  requiredBindings: [MEDIA_R2_BINDING],
  formMeta: [
    {
      key: 'publicBaseUrl',
      label: 'Public base URL',
      type: 'url',
      placeholder: 'https://media.example.com',
      help: 'Use an R2 custom domain in production. r2.dev is rate-limited for development only; disable it after connecting a custom domain so it cannot bypass WAF or Access.',
      required: true
    },
    {
      key: 'keyPrefix',
      label: 'Key prefix',
      type: 'text',
      placeholder: 'uploads/',
      help: 'Optional safe path prefix prepended to every stored object key, for example uploads/2026/.',
      required: false
    }
  ],
  actions: [{ key: 'test', label: 'Check configuration and binding' }]
}
