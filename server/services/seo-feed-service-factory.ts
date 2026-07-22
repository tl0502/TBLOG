import { useRuntimeConfig } from '#imports'
import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createCacheProviderForEvent } from '../providers/cache/cache-provider-factory'
import { createPostReadRepository } from '../repositories/post-read-repository'
import { createSettingsRepository } from '../repositories/settings-repository'
import { createTaxonomyReadRepository } from '../repositories/taxonomy-read-repository'
import { createSeoFeedService } from './seo-feed-service'

export function createSeoFeedServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)
  const runtimeConfig = useRuntimeConfig(event)

  return createSeoFeedService({
    settingsRepository: createSettingsRepository(db),
    postReadRepository: createPostReadRepository(db),
    taxonomyReadRepository: createTaxonomyReadRepository(db),
    cache: createCacheProviderForEvent(event),
    fallbackBaseUrl: runtimeConfig.public.siteUrl
  })
}
