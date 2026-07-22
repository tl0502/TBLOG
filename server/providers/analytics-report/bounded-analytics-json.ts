import { MAX_ANALYTICS_REPORT_BYTES } from '../../domain/analytics-report'
import { AnalyticsReportProviderError } from './analytics-report-provider'

/** Read a provider response without allowing an unbounded body into Worker memory. */
export async function readBoundedAnalyticsJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_ANALYTICS_REPORT_BYTES) {
    await response.body?.cancel().catch(() => {})
    throw new AnalyticsReportProviderError()
  }
  if (!response.body) throw new AnalyticsReportProviderError()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_ANALYTICS_REPORT_BYTES) {
        await reader.cancel().catch(() => {})
        throw new AnalyticsReportProviderError()
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new AnalyticsReportProviderError()
  }
}
