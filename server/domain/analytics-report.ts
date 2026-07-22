import { z } from 'zod'

export const ANALYTICS_REPORT_SCHEMA_VERSION = 1 as const
export const ANALYTICS_REPORT_STATE_ID = 'default'
export const MAX_ANALYTICS_REPORT_BYTES = 524_288
export const MAX_ANALYTICS_REPORT_ARTICLES = 2_000
export const MAX_ANALYTICS_REPORT_HOTSPOTS = 100

export const analyticsReportScheduleValues = [
  'off',
  'hourly',
  'every6Hours',
  'every12Hours',
  'daily',
  'weekly'
] as const
export type AnalyticsReportSchedule = (typeof analyticsReportScheduleValues)[number]

export const analyticsReportWeekdayValues = [
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'
] as const
export type AnalyticsReportWeekday = (typeof analyticsReportWeekdayValues)[number]

const dateTime = z.string().datetime({ offset: true })
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const articlePath = z.string().trim().max(512).regex(/^\/posts\/[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@%-]*$/)
const count = z.number().int().nonnegative().safe()

export const analyticsReportSourceSchema = z.object({
  schemaVersion: z.literal(ANALYTICS_REPORT_SCHEMA_VERSION),
  revision: z.string().trim().min(1).max(200),
  generatedAt: dateTime,
  syncedThrough: day,
  articles: z.array(z.object({ path: articlePath, pageViews: count }).strip())
    .max(MAX_ANALYTICS_REPORT_ARTICLES),
  currentHotspots: z.array(z.object({
    path: articlePath,
    pageViews: count,
    previousPageViews: count.optional().default(0)
  }).strip()).max(MAX_ANALYTICS_REPORT_HOTSPOTS).optional().default([]),
  historicalHotspots: z.array(z.object({ path: articlePath, pageViews: count }).strip())
    .max(MAX_ANALYTICS_REPORT_HOTSPOTS).optional().default([])
}).strip()

export type AnalyticsReportSource = z.infer<typeof analyticsReportSourceSchema>

const normalizedArticleSchema = z.object({
  postId: z.string().trim().min(1).max(200),
  path: articlePath,
  pageViews: count,
  publishedAt: dateTime
}).strip()

const normalizedHotspotSchema = z.object({
  postId: z.string().trim().min(1).max(200),
  pageViews: count,
  previousPageViews: count.optional().default(0)
}).strip()

export const publishedAnalyticsReportSchema = z.object({
  schemaVersion: z.literal(ANALYTICS_REPORT_SCHEMA_VERSION),
  revision: z.string().trim().min(1).max(200),
  sourceRevision: z.string().trim().min(1).max(200).optional(),
  providerKey: z.string().trim().min(1).max(100),
  configFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sourceGeneratedAt: dateTime,
  publishedAt: dateTime,
  syncedThrough: day,
  articles: z.array(normalizedArticleSchema).max(MAX_ANALYTICS_REPORT_ARTICLES),
  currentHotspots: z.array(normalizedHotspotSchema).max(MAX_ANALYTICS_REPORT_HOTSPOTS),
  historicalHotspots: z.array(normalizedHotspotSchema.omit({ previousPageViews: true }))
    .max(MAX_ANALYTICS_REPORT_HOTSPOTS),
  publishedArticlePageViews: count
}).strip()

export type PublishedAnalyticsReport = z.infer<typeof publishedAnalyticsReportSchema>

export interface AnalyticsReportState {
  enabled: boolean
  schedule: AnalyticsReportSchedule
  timeOfDay: string
  timezone: string
  dayOfWeek: AnalyticsReportWeekday
  activeProvider: string | null
  configFingerprint: string | null
  activeRevision: string | null
  sourceGeneratedAt: Date | null
  publishedAt: Date | null
  syncedThrough: string | null
  lastAttemptAt: Date | null
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  lastError: string | null
}

export const EMPTY_ANALYTICS_REPORT_STATE: AnalyticsReportState = {
  enabled: false,
  schedule: 'off',
  timeOfDay: '03:00',
  timezone: 'UTC',
  dayOfWeek: 'mon',
  activeProvider: null,
  configFingerprint: null,
  activeRevision: null,
  sourceGeneratedAt: null,
  publishedAt: null,
  syncedThrough: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null
}
