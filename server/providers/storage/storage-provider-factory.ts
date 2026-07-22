import type { H3Event } from 'h3'
import {
  cloudflareR2StorageConfigSchema,
  CLOUDFLARE_R2_STORAGE_PROVIDER_KEY,
  isR2BucketBinding,
  MEDIA_R2_BINDING,
  validateCloudflareR2StorageConfig,
  type CloudflareR2StorageConfig
} from '../../integrations/providers/cloudflare-r2-storage'
import { getDatabaseClient } from '../../database/client'
import { createIntegrationSettingsRepository } from '../../repositories/integration-settings-repository'
import { createR2StorageProvider, type R2BucketLike } from './r2-storage-provider'
import type { StorageProvider } from './storage-provider'
import { createUnconfiguredStorageProvider } from './unconfigured-storage-provider'

interface R2StorageOptions {
  bucket: R2BucketLike
  publicBaseUrl: string
  keyPrefix: string
}

/**
 * Resolve complete R2 options from public config + the `MEDIA_R2` binding, or `null` when the binding
 * or the public base URL is missing. Single source of truth for "is upload storage usable". The bucket
 * is only ever read from `env` (Cloudflare), never from persisted config.
 */
export function resolveR2StorageOptions(
  config: unknown,
  env: Record<string, unknown>
): R2StorageOptions | null {
  const binding = env[MEDIA_R2_BINDING]
  if (!isR2BucketBinding(binding)) {
    return null
  }
  const parsed = cloudflareR2StorageConfigSchema.safeParse(config)
  if (!parsed.success) return null
  const validated = parsed.data as CloudflareR2StorageConfig
  if (validateCloudflareR2StorageConfig(validated as Record<string, unknown>)) return null
  if (!validated.publicBaseUrl) return null
  return {
    bucket: binding,
    publicBaseUrl: validated.publicBaseUrl,
    keyPrefix: validated.keyPrefix ?? ''
  }
}

export interface CreateStorageProviderParams {
  enabled: boolean
  config: unknown
  env: Record<string, unknown>
}

/**
 * Resolve the storage provider for a write path. Returns the unconfigured no-op when storage is
 * disabled or its binding/config is incomplete, so external URL insertion stays the default and an
 * ungated caller fails loudly rather than silently dropping an upload.
 */
export function createStorageProvider(params: CreateStorageProviderParams): StorageProvider {
  if (!params.enabled) {
    return createUnconfiguredStorageProvider()
  }
  const options = resolveR2StorageOptions(params.config, params.env)
  return options ? createR2StorageProvider(options) : createUnconfiguredStorageProvider()
}

/** Resolve active R2 storage for an authenticated write path; `null` keeps uploads optional. */
export async function resolveStorageProviderForEvent(event: H3Event): Promise<StorageProvider | null> {
  const env = event.context.cloudflare?.env ?? {}
  if (!isR2BucketBinding(env[MEDIA_R2_BINDING])) return null

  const row = await createIntegrationSettingsRepository(getDatabaseClient(event))
    .findByCapabilityAndProvider('storage', CLOUDFLARE_R2_STORAGE_PROVIDER_KEY)
  if (!row?.enabled) return null

  let config: unknown = {}
  try {
    config = row.publicConfigJson ? JSON.parse(row.publicConfigJson) : {}
  } catch {
    return null
  }
  const options = resolveR2StorageOptions(config, env)
  return options ? createR2StorageProvider(options) : null
}
