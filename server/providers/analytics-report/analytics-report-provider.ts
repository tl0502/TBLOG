import type { AnalyticsReportSource } from '../../domain/analytics-report'

export interface AnalyticsReportProvider {
  providerKey: string
  fetchReport(): Promise<AnalyticsReportSource>
}

export class AnalyticsReportProviderError extends Error {
  constructor() {
    super('Analytics report provider request failed')
    this.name = 'AnalyticsReportProviderError'
  }
}
