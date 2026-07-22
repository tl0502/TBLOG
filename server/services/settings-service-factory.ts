import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createCacheProviderForEvent } from '../providers/cache/cache-provider-factory'
import { createSettingsRepository } from '../repositories/settings-repository'
import { createIntegrationSettingsRepository } from '../repositories/integration-settings-repository'
import { createSettingsService } from './settings-service'

export function mergeRuntimeEnv(
  baseEnv: Record<string, unknown>,
  cloudflareEnv?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...baseEnv,
    ...(cloudflareEnv ?? {})
  }
}

export function createSettingsServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)
  // Wrangler/Nitro may expose a Cloudflare env object even when local `.env` values
  // are only available through process.env. Merge both sources so a binding-only
  // Cloudflare context does not hide optional local integration values during development.
  const env = mergeRuntimeEnv(process.env, event.context.cloudflare?.env)

  return createSettingsService({
    settingsRepository: createSettingsRepository(db),
    integrationRepository: createIntegrationSettingsRepository(db),
    cache: createCacheProviderForEvent(event),
    env
  })
}
