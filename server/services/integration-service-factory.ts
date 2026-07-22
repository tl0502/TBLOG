import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createIntegrationSettingsRepository } from '../repositories/integration-settings-repository'
import { createSearchResyncRepository } from '../repositories/search-resync-repository'
import { createSearchSyncJobRepository } from '../repositories/search-sync-job-repository'
import { createConfiguredSearchProvider } from '../providers/search/search-provider-factory'
import { createIntegrationService } from './integration-service'
import { createCacheProviderForEvent } from '../providers/cache/cache-provider-factory'
import { createCommentReplicaJobRepository } from '../repositories/comment-replica-job-repository'
import { mergeCloudflareRuntimeEnv } from '../utils/runtime-env'

export { mergeCloudflareRuntimeEnv as mergeRuntimeEnv } from '../utils/runtime-env'

export function createIntegrationServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)
  const cloudflareEnv = event.context.cloudflare?.env
  const env = mergeCloudflareRuntimeEnv(process.env, cloudflareEnv)

  return createIntegrationService({
    integrationRepository: createIntegrationSettingsRepository(db),
    env,
    searchProviderFactory: createConfiguredSearchProvider,
    searchResyncRepository: createSearchResyncRepository(db),
    searchSyncJobRepository: createSearchSyncJobRepository(db),
    commentReplicaJobRepository: createCommentReplicaJobRepository(db),
    cache: createCacheProviderForEvent(event)
  })
}
