import type { H3Event } from 'h3'
import { getDatabaseClient, type AppDatabase } from '../database/client'
import { createCacheProviderForEvent } from '../providers/cache/cache-provider-factory'
import type { SearchProvider } from '../providers/search/search-provider'
import { createNoOpSearchProvider } from '../providers/search/no-op-search-provider'
import { createConfiguredSearchProvider } from '../providers/search/search-provider-factory'
import { createAdminPostRepository } from '../repositories/admin-post-repository'
import { createIntegrationSettingsRepository } from '../repositories/integration-settings-repository'
import { createPostContentRepository } from '../repositories/post-content-repository'
import { createSearchIndexReadRepository } from '../repositories/search-index-read-repository'
import { createSearchSyncJobRepository } from '../repositories/search-sync-job-repository'
import type { IntegrationEnvironment } from '../integrations/registry'
import { createAdminPostService } from './admin-post-service'
import { createContentProcessingService } from './content-processing-service'
import { createSearchSyncHealthReporter } from './search-sync-health-reporter'
import { createSearchSyncStatusReporter } from './search-sync-status-reporter'
import { mergeCloudflareRuntimeEnv } from '../utils/runtime-env'

// Resolves the active search provider from the persisted integration + Cloudflare env, reusing the
// shared readiness gate in search-provider-factory so the write path and the resync path agree on
// what "configured" means. The privileged admin key comes only from Secrets, never from D1.
function createSearchProviderForEvent(db: AppDatabase, env: IntegrationEnvironment): SearchProvider {
  // Resolve lazily on first use so building the service stays synchronous (no factory signature churn).
  let cached: Promise<SearchProvider> | null = null

  async function resolve(): Promise<SearchProvider> {
    const record = await createIntegrationSettingsRepository(db).findByCapabilityAndProvider(
      'search',
      'algolia'
    )

    let config: Record<string, unknown> = {}
    try {
      config = record?.publicConfigJson ? JSON.parse(record.publicConfigJson) : {}
    } catch {
      config = {}
    }

    if (!record?.enabled) return createNoOpSearchProvider()
    const provider = createConfiguredSearchProvider({ config, env })
    if (!provider) throw new Error('Search provider is unavailable')
    return provider
  }

  function get(): Promise<SearchProvider> {
    return (cached ??= resolve())
  }

  return {
    async indexRecord(record) {
      await (await get()).indexRecord(record)
    },
    async removeRecord(objectID) {
      await (await get()).removeRecord(objectID)
    },
    async replaceAllRecords(records) {
      await (await get()).replaceAllRecords(records)
    }
  }
}

function createSearchSyncStatusReporterForDatabase(db: AppDatabase) {
  const integrationRepository = createIntegrationSettingsRepository(db)
  const jobRepository = createSearchSyncJobRepository(db)
  const healthReporter = createSearchSyncHealthReporter({ integrationRepository })
  return createSearchSyncStatusReporter({ integrationRepository, jobRepository, healthReporter })
}

export function createAdminPostServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)
  const env = mergeCloudflareRuntimeEnv(
    process.env,
    event.context.cloudflare?.env
  ) as IntegrationEnvironment

  return createAdminPostService({
    adminPostRepository: createAdminPostRepository(db),
    contentProcessingService: createContentProcessingService({
      postContentRepository: createPostContentRepository(db)
    }),
    cache: createCacheProviderForEvent(event),
    searchProvider: createSearchProviderForEvent(db, env),
    searchRecordSource: createSearchIndexReadRepository(db),
    searchSyncStatusReporter: createSearchSyncStatusReporterForDatabase(db)
  })
}
