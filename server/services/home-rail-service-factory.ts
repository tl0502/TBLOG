import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createHomeRailReadRepository } from '../repositories/home-rail-read-repository'
import { createSettingsRepository } from '../repositories/settings-repository'
import { createHomeRailService } from './home-rail-service'
import { createAnalyticsReportReaderForEvent } from './analytics-report-reader-factory'

export function createHomeRailServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)
  return createHomeRailService({
    settingsRepository: createSettingsRepository(db),
    homeRailRepository: createHomeRailReadRepository(db),
    analyticsReportService: createAnalyticsReportReaderForEvent(event)
  })
}
