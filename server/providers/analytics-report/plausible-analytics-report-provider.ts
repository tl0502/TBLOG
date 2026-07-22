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

const PLAUSIBLE_QUERY_PATH = '/api/v2/query'
const DAY_MS = 86_400_000
const countSchema = z.number().int().nonnegative().safe()
const articlePathSchema = z.string().trim().max(512)
  .regex(/^\/posts\/[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@%-]*$/)

const plausibleResponseSchema = z.object({
  results: z.array(z.object({
    dimensions: z.tuple([z.string()]),
    metrics: z.tuple([countSchema])
  }).strip()).max(MAX_ANALYTICS_REPORT_ARTICLES),
  meta: z.object({ total_rows: countSchema }).passthrough(),
  query: z.unknown().optional()
}).strip()

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function completeUtcDay(now: Date): Date {
  return new Date(`${formatDay(now)}T00:00:00.000Z`)
}

function utcRange(endExclusive: Date, days: number): [string, string] {
  return [
    new Date(endExclusive.getTime() - days * DAY_MS).toISOString(),
    new Date(endExclusive.getTime() - 1).toISOString()
  ]
}

async function sourceRevision(source: Omit<AnalyticsReportSource, 'schemaVersion' | 'revision' | 'generatedAt'>) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(source))
  )
  return `plausible:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

export function createPlausibleAnalyticsReportProvider(options: {
  providerKey: string
  baseUrl: string
  siteId: string
  apiKey: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  now?: () => Date
}): AnalyticsReportProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? (() => new Date())

  return {
    providerKey: options.providerKey,
    async fetchReport(): Promise<AnalyticsReportSource> {
      const generatedAt = now()
      const endExclusive = completeUtcDay(generatedAt)
      const completedThrough = new Date(endExclusive.getTime() - DAY_MS)
      const syncedThrough = formatDay(completedThrough)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)

      try {
        async function query(dateRange: [string, string]) {
          const response = await fetchImpl(new URL(PLAUSIBLE_QUERY_PATH, options.baseUrl), {
            method: 'POST',
            redirect: 'error',
            signal: controller.signal,
            headers: {
              accept: 'application/json',
              authorization: `Bearer ${options.apiKey}`,
              'content-type': 'application/json',
              'user-agent': 'tblog-plausible-analytics-report/1.0'
            },
            body: JSON.stringify({
              site_id: options.siteId,
              metrics: ['pageviews'],
              date_range: dateRange,
              dimensions: ['event:page'],
              filters: [['matches', 'event:page', ['^/posts/[^/]+$']]],
              order_by: [['pageviews', 'desc'], ['event:page', 'asc']],
              include: { total_rows: true },
              pagination: { limit: MAX_ANALYTICS_REPORT_ARTICLES, offset: 0 }
            })
          })
          if (!response.ok) throw new AnalyticsReportProviderError()

          const parsed = plausibleResponseSchema.safeParse(await readBoundedAnalyticsJson(response))
          if (!parsed.success
            || parsed.data.meta.total_rows > MAX_ANALYTICS_REPORT_ARTICLES
            || parsed.data.meta.total_rows !== parsed.data.results.length) {
            throw new AnalyticsReportProviderError()
          }

          const paths = new Set<string>()
          const rows = parsed.data.results.map((row) => {
            const path = articlePathSchema.safeParse(row.dimensions[0])
            if (!path.success || paths.has(path.data)) throw new AnalyticsReportProviderError()
            paths.add(path.data)
            return { path: path.data, pageViews: row.metrics[0] }
          })
          rows.sort((left, right) => right.pageViews - left.pageViews || left.path.localeCompare(right.path))
          return rows
        }

        const [articles, currentRows, previousRows] = await Promise.all([
          query(utcRange(endExclusive, 730)),
          query(utcRange(endExclusive, 7)),
          query(utcRange(new Date(endExclusive.getTime() - 7 * DAY_MS), 7))
        ])
        const previousByPath = new Map(previousRows.map((row) => [row.path, row.pageViews]))
        const currentHotspots = currentRows.slice(0, MAX_ANALYTICS_REPORT_HOTSPOTS).map((row) => ({
          ...row,
          previousPageViews: previousByPath.get(row.path) ?? 0
        }))
        const historicalHotspots = articles.slice(0, MAX_ANALYTICS_REPORT_HOTSPOTS)
        const revisionSource = { syncedThrough, articles, currentHotspots, historicalHotspots }

        const source = analyticsReportSourceSchema.safeParse({
          schemaVersion: 1,
          revision: await sourceRevision(revisionSource),
          generatedAt: generatedAt.toISOString(),
          ...revisionSource
        })
        if (!source.success) throw new AnalyticsReportProviderError()
        return source.data
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
