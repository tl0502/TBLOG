import type {
  AnalyticsReportSchedule,
  AnalyticsReportState,
  AnalyticsReportWeekday,
  PublishedAnalyticsReport
} from '../../domain/analytics-report'

export interface AnalyticsReportArticleRef {
  id: string
  slug: string
  publishedAt: Date
}

export interface AnalyticsReportArticleRepository {
  listAllPublishedAnalyticsArticles(): Promise<AnalyticsReportArticleRef[]>
  listPublishedArticleIds(): Promise<string[]>
}

export interface AnalyticsReportStateRepository {
  getState(): Promise<AnalyticsReportState>
  getCurrentReport(): Promise<PublishedAnalyticsReport | null>
  updateSettings(input: {
    enabled: boolean
    schedule: AnalyticsReportSchedule
    timeOfDay: string
    timezone: string
    dayOfWeek: AnalyticsReportWeekday
  }): Promise<AnalyticsReportState>
  tryStartRun(runId: string, now: Date, lockedUntil: Date): Promise<boolean>
  renewRun(runId: string, now: Date, lockedUntil: Date): Promise<boolean>
  markSuccess(input: {
    runId: string
    providerKey: string
    integrationUpdatedAt: Date
    configFingerprint: string
    revision: string
    sourceGeneratedAt: Date
    publishedAt: Date
    completedAt: Date
    syncedThrough: string
    reportJson: string
  }): Promise<boolean>
  markFailure(runId: string, now: Date, message: string): Promise<boolean>
}
