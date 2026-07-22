import type { H3Event } from 'h3'
import { createDatabaseClient } from '../database/client'
import type { IntegrationEnvironment } from '../integrations/registry'
import { createConfiguredSearchProvider } from '../providers/search/search-provider-factory'
import { createIntegrationSettingsRepository } from '../repositories/integration-settings-repository'
import { createSearchIndexReadRepository } from '../repositories/search-index-read-repository'
import { createSearchSyncJobRepository } from '../repositories/search-sync-job-repository'
import { createSearchSyncHealthReporter } from './search-sync-health-reporter'
import { createSearchSyncRetryService } from './search-sync-retry-service'
import { mergeCloudflareRuntimeEnv } from '../utils/runtime-env'

function parseConfig(json: string | null): Record<string, unknown> {
  if (!json) return {}
  try {
    const value = JSON.parse(json)
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export async function createSearchSyncRetryServiceForEvent(event: H3Event) {
  const binding = event.context.cloudflare?.env?.DB
  if (!binding) throw new Error('D1 binding DB is not available')
  return createSearchSyncRetryServiceForBindings({
    ...event.context.cloudflare?.env,
    DB: binding
  })
}

export async function createSearchSyncRetryServiceForBindings(
  bindings: Record<string, unknown> & { DB: D1Database }
) {
  const db = createDatabaseClient(bindings.DB)
  const env = mergeCloudflareRuntimeEnv(
    process.env,
    bindings
  ) as IntegrationEnvironment
  const integrationRepository = createIntegrationSettingsRepository(db)
  const row = await integrationRepository.findByCapabilityAndProvider('search', 'algolia')
  const searchProvider = row?.enabled
    ? createConfiguredSearchProvider({ config: parseConfig(row.publicConfigJson), env })
    : null

  return createSearchSyncRetryService({
    jobRepository: createSearchSyncJobRepository(db),
    searchRecordSource: createSearchIndexReadRepository(db),
    searchProvider,
    enabled: row?.enabled === true,
    healthReporter: createSearchSyncHealthReporter({ integrationRepository })
  })
}
