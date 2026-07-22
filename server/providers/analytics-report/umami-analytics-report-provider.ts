import { z } from 'zod'
import {
  MAX_ANALYTICS_REPORT_ARTICLES,
  MAX_ANALYTICS_REPORT_HOTSPOTS,
  analyticsReportSourceSchema,
  type AnalyticsReportSource
} from '../../domain/analytics-report'
import {
  AnalyticsReportProviderError,
  type AnalyticsReportProvider
} from './analytics-report-provider'
import { readBoundedAnalyticsJson } from './bounded-analytics-json'

const DAY_MS = 86_400_000
const CURRENT_WINDOW_DAYS = 7
const TOTAL_WINDOW_DAYS = 730
const METRICS_LIMIT = MAX_ANALYTICS_REPORT_ARTICLES + 1
const ARTICLE_PATH = /^\/posts\/[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@%-]*$/

const pageViewsSchema = z.union([
  z.number(),
  z.string().regex(/^\d+$/).transform(Number)
]).pipe(z.number().int().nonnegative().safe())

const metricRowsSchema = z.array(z.object({
  name: z.string().min(1).max(2_048),
  pageviews: pageViewsSchema
}).strip()).max(METRICS_LIMIT)

type MetricRow = z.infer<typeof metricRowsSchema>[number]
export type UmamiAuthMode = 'apiKey' | 'bearer'
export type UmamiAnalyticsProbeResult =
  | { ok: true }
  | {
      ok: false
      reason: 'authentication' | 'permission' | 'notFound' | 'rateLimited' | 'incompatible'
        | 'redirect' | 'upstream' | 'invalidResponse' | 'timeout' | 'network'
      statusCode?: number
    }

export interface UmamiAnalyticsRequestOptions {
  apiBaseUrl: string
  websiteId: string
  token: string
  authMode?: UmamiAuthMode
  timeoutMs?: number
  fetchImpl?: typeof fetch
  now?: () => Date
}

function currentUtcWindows(now: Date) {
  const currentDayStartAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const currentStartAt = currentDayStartAt - (CURRENT_WINDOW_DAYS - 1) * DAY_MS
  return {
    endAt: now.getTime(),
    currentStartAt,
    previousStartAt: currentStartAt - CURRENT_WINDOW_DAYS * DAY_MS,
    totalStartAt: currentDayStartAt - (TOTAL_WINDOW_DAYS - 1) * DAY_MS,
    syncedThrough: now.toISOString().slice(0, 10)
  }
}

function normalizeRows(value: unknown): MetricRow[] {
  const parsed = metricRowsSchema.safeParse(value)
  if (!parsed.success) throw new AnalyticsReportProviderError()
  if (parsed.data.length > MAX_ANALYTICS_REPORT_ARTICLES) throw new AnalyticsReportProviderError()
  const paths = new Set<string>()
  for (const row of parsed.data) {
    if (paths.has(row.name)) throw new AnalyticsReportProviderError()
    paths.add(row.name)
  }
  return [...parsed.data].sort((left, right) => (
    right.pageviews - left.pageviews || left.name.localeCompare(right.name)
  ))
}

function articleRows(rows: readonly MetricRow[]) {
  return rows.filter((row) => ARTICLE_PATH.test(row.name)).map((row) => ({
    path: row.name,
    pageViews: row.pageviews
  }))
}

async function revisionFor(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
  return `umami-${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

function requestHeaders(options: UmamiAnalyticsRequestOptions): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (options.authMode === 'bearer') headers.authorization = `Bearer ${options.token}`
  else headers['x-umami-api-key'] = options.token
  return headers
}

function metricsUrl(
  options: UmamiAnalyticsRequestOptions,
  startAt: number,
  endAt: number,
  limit: number
): URL {
  const baseUrl = new URL(options.apiBaseUrl)
  if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/'
  const url = new URL(`websites/${encodeURIComponent(options.websiteId)}/metrics/expanded`, baseUrl)
  url.searchParams.set('startAt', String(startAt))
  url.searchParams.set('endAt', String(endAt))
  url.searchParams.set('type', 'path')
  url.searchParams.set('search', '/posts/')
  url.searchParams.set('limit', String(limit))
  return url
}

export async function probeUmamiAnalyticsReport(
  options: UmamiAnalyticsRequestOptions
): Promise<UmamiAnalyticsProbeResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const endAt = (options.now ?? (() => new Date()))().getTime()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)

  try {
    let response: Response
    try {
      response = await fetchImpl(metricsUrl(options, endAt - DAY_MS, endAt, 1), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: requestHeaders(options)
      })
    } catch {
      return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' }
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      if (response.status >= 300 && response.status < 400) {
        return { ok: false, reason: 'redirect', statusCode: response.status }
      }
      if (response.status === 401) return { ok: false, reason: 'authentication', statusCode: 401 }
      if (response.status === 403) return { ok: false, reason: 'permission', statusCode: 403 }
      if (response.status === 404) return { ok: false, reason: 'notFound', statusCode: 404 }
      if (response.status === 429) return { ok: false, reason: 'rateLimited', statusCode: 429 }
      if (response.status === 400 || response.status === 422) {
        return { ok: false, reason: 'incompatible', statusCode: response.status }
      }
      return { ok: false, reason: 'upstream', statusCode: response.status }
    }

    try {
      normalizeRows(await readBoundedAnalyticsJson(response))
    } catch {
      return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'invalidResponse' }
    }
    return { ok: true }
  } finally {
    clearTimeout(timeout)
  }
}

export function createUmamiAnalyticsReportProvider(
  options: UmamiAnalyticsRequestOptions & { providerKey: string }
): AnalyticsReportProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? (() => new Date())

  return {
    providerKey: options.providerKey,
    async fetchReport(): Promise<AnalyticsReportSource> {
      const generatedAt = now()
      const windows = currentUtcWindows(generatedAt)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)

      const fetchMetrics = async (startAt: number, endAt: number) => {
        const response = await fetchImpl(metricsUrl(options, startAt, endAt, METRICS_LIMIT), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: requestHeaders(options)
        })
        if (!response.ok) throw new AnalyticsReportProviderError()
        return normalizeRows(await readBoundedAnalyticsJson(response))
      }

      try {
        const [totals, current, previous] = await Promise.all([
          fetchMetrics(windows.totalStartAt, windows.endAt),
          fetchMetrics(windows.currentStartAt, windows.endAt),
          fetchMetrics(windows.previousStartAt, windows.currentStartAt - 1)
        ])
        const previousByPath = new Map(previous.map((row) => [row.name, row.pageviews]))
        const source = {
          schemaVersion: 1 as const,
          revision: await revisionFor({ windows, totals, current, previous }),
          generatedAt: generatedAt.toISOString(),
          syncedThrough: windows.syncedThrough,
          articles: articleRows(totals),
          currentHotspots: articleRows(current).slice(0, MAX_ANALYTICS_REPORT_HOTSPOTS).map((row) => ({
            ...row,
            previousPageViews: previousByPath.get(row.path) ?? 0
          })),
          historicalHotspots: articleRows(totals).slice(0, MAX_ANALYTICS_REPORT_HOTSPOTS)
        }
        const parsed = analyticsReportSourceSchema.safeParse(source)
        if (!parsed.success) throw new AnalyticsReportProviderError()
        return parsed.data
      } catch (error) {
        controller.abort()
        if (error instanceof AnalyticsReportProviderError) throw error
        throw new AnalyticsReportProviderError()
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}
