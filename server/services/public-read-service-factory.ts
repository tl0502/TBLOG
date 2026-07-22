import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createCacheProviderForEvent } from '../providers/cache/cache-provider-factory'
import { createPostReadRepository } from '../repositories/post-read-repository'
import { createTaxonomyReadRepository } from '../repositories/taxonomy-read-repository'
import { createPublicContentService } from './public-content-service'
import { createAnalyticsReportReaderForEvent } from './analytics-report-reader-factory'
import { createTaxonomyReadService } from './taxonomy-read-service'

export function createPublicContentServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)
  const postReadRepository = createPostReadRepository(db)

  return createPublicContentService({
    postReadRepository,
    featuredPostReadRepository: postReadRepository,
    analyticsReportService: createAnalyticsReportReaderForEvent(event),
    cache: createCacheProviderForEvent(event)
  })
}

export function createTaxonomyReadServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)

  return createTaxonomyReadService({
    postReadRepository: createPostReadRepository(db),
    taxonomyReadRepository: createTaxonomyReadRepository(db),
    cache: createCacheProviderForEvent(event)
  })
}
