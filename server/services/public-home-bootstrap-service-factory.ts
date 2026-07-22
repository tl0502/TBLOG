import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createCacheProviderForEvent } from '../providers/cache/cache-provider-factory'
import { createHomeRailReadRepository } from '../repositories/home-rail-read-repository'
import { createPostReadRepository } from '../repositories/post-read-repository'
import { createSettingsRepository } from '../repositories/settings-repository'
import { createTaxonomyReadRepository } from '../repositories/taxonomy-read-repository'
import { createHomeRailService } from './home-rail-service'
import { createPublicContentService } from './public-content-service'
import { createPublicHomeBootstrapService } from './public-home-bootstrap-service'
import { createPublicHotspotService } from './public-hotspot-service'
import { createTaxonomyReadService } from './taxonomy-read-service'
import { createAnalyticsReportReaderForEvent } from './analytics-report-reader-factory'

export function createPublicHomeBootstrapServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)
  const cache = createCacheProviderForEvent(event)
  const postReadRepository = createPostReadRepository(db)
  const analyticsReportService = createAnalyticsReportReaderForEvent(event)

  const publicContentService = createPublicContentService({
    postReadRepository,
    featuredPostReadRepository: postReadRepository,
    analyticsReportService,
    cache
  })
  const publicHotspotService = createPublicHotspotService({
    analyticsReportService,
    postReadRepository
  })
  const homeRailService = createHomeRailService({
    settingsRepository: createSettingsRepository(db),
    homeRailRepository: createHomeRailReadRepository(db),
    analyticsReportService
  })
  const taxonomyReadService = createTaxonomyReadService({
    postReadRepository,
    taxonomyReadRepository: createTaxonomyReadRepository(db),
    cache
  })

  return createPublicHomeBootstrapService({
    getFeed: (query) => publicContentService.getHomeFeed(query),
    getFeatured: () => publicContentService.getFeaturedPosts(),
    getHotspots: () => publicHotspotService.getHotspots(),
    getHomeRail: () => homeRailService.getPublicData(),
    getTags: () => taxonomyReadService.getTags()
  })
}
