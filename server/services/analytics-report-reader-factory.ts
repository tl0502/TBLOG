import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createAnalyticsReportStateRepository } from '../repositories/analytics-report-state-repository'
import { createPostReadRepository } from '../repositories/post-read-repository'
import { createAnalyticsReportReader } from './analytics-report-service'

export function createAnalyticsReportReaderForEvent(event: H3Event) {
  const db = getDatabaseClient(event)
  return createAnalyticsReportReader({
    stateRepository: createAnalyticsReportStateRepository(db),
    articleRepository: createPostReadRepository(db)
  })
}
