import {
  analyticsReportSourceSchema,
  type AnalyticsReportSource
} from '../../domain/analytics-report'
import {
  AnalyticsReportProviderError,
  type AnalyticsReportProvider
} from './analytics-report-provider'
import { readBoundedAnalyticsJson } from './bounded-analytics-json'

export function createHttpAnalyticsReportProvider(options: {
  providerKey: string
  endpoint: string
  token: string
  siteId?: string | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): AnalyticsReportProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  return {
    providerKey: options.providerKey,
    async fetchReport(): Promise<AnalyticsReportSource> {
      const url = new URL(options.endpoint)
      if (options.siteId) url.searchParams.set('siteId', options.siteId)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${options.token}`,
            'user-agent': 'tblog-analytics-report/1.0'
          }
        })
        if (!response.ok) throw new AnalyticsReportProviderError()
        const parsed = analyticsReportSourceSchema.safeParse(await readBoundedAnalyticsJson(response))
        if (!parsed.success) throw new AnalyticsReportProviderError()
        return parsed.data
      } catch (error) {
        if (error instanceof AnalyticsReportProviderError) throw error
        throw new AnalyticsReportProviderError()
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}
