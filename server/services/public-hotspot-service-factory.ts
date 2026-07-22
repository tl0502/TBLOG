import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createPostReadRepository } from '../repositories/post-read-repository'
import { createPublicHotspotService } from './public-hotspot-service'
import { createAnalyticsReportReaderForEvent } from './analytics-report-reader-factory'

export function createPublicHotspotServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)
  return createPublicHotspotService({
    analyticsReportService: createAnalyticsReportReaderForEvent(event),
    postReadRepository: createPostReadRepository(db)
  })
}
