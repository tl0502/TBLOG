import { authError } from '../domain/auth-errors'
import { DomainError } from '../domain/domain-error'
import {
  MAX_ANALYTICS_REPORT_ARTICLES,
  MAX_ANALYTICS_REPORT_BYTES,
  publishedAnalyticsReportSchema,
  type AnalyticsReportSchedule,
  type AnalyticsReportWeekday,
  type PublishedAnalyticsReport
} from '../domain/analytics-report'
import type { AnalyticsReportProvider } from '../providers/analytics-report/analytics-report-provider'
import type {
  AnalyticsReportArticleRepository,
  AnalyticsReportStateRepository
} from '../repositories/contracts/analytics-report-repositories'
import type {
  IntegrationSettingsRepository,
  StoredIntegration
} from '../repositories/contracts/integration-repositories'
import type { CacheProvider } from '../providers/cache/cache-provider'
import { cacheKeys } from '../utils/cache-keys'
import type { Permission } from './permissions'

const SYNC_LEASE_MS = 10 * 60_000

function requireMaintenance(permissions: readonly Permission[]) {
  if (!permissions.includes('maintenance:*')) throw authError('forbidden', 'Permission denied', 403)
}

const WEEKDAY_INDEX: Record<AnalyticsReportWeekday, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6
}

const INTERVAL_MS: Partial<Record<AnalyticsReportSchedule, number>> = {
  hourly: 60 * 60_000,
  every6Hours: 6 * 60 * 60_000,
  every12Hours: 12 * 60 * 60_000
}

function localParts(date: Date, timezone: string): {
  day: string
  time: string
  weekday: AnalyticsReportWeekday
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return {
    day: `${values.get('year')}-${values.get('month')}-${values.get('day')}`,
    time: `${values.get('hour')}:${values.get('minute')}`,
    weekday: values.get('weekday')!.toLowerCase() as AnalyticsReportWeekday
  }
}

function isDue(state: Awaited<ReturnType<AnalyticsReportStateRepository['getState']>>, now: Date): boolean {
  if (!state.enabled || state.schedule === 'off') return false
  if (state.lastSuccessAt
    && (!state.activeProvider || !state.configFingerprint || !state.activeRevision || !state.publishedAt)) {
    return true
  }
  const interval = INTERVAL_MS[state.schedule]
  if (interval) return !state.lastSuccessAt || now.getTime() - state.lastSuccessAt.getTime() >= interval

  const current = localParts(now, state.timezone)
  if (state.schedule === 'daily') {
    if (current.time < state.timeOfDay) return false
    if (!state.lastSuccessAt) return true
    const previous = localParts(state.lastSuccessAt, state.timezone)
    return previous.day !== current.day || previous.time < state.timeOfDay
  }

  const currentIndex = WEEKDAY_INDEX[current.weekday]
  const targetIndex = WEEKDAY_INDEX[state.dayOfWeek]
  if (currentIndex < targetIndex || (currentIndex === targetIndex && current.time < state.timeOfDay)) {
    return false
  }
  if (!state.lastSuccessAt) return true
  const previous = localParts(state.lastSuccessAt, state.timezone)
  const currentDayNumber = Math.floor(Date.parse(`${current.day}T00:00:00.000Z`) / 86_400_000)
  const previousDayNumber = Math.floor(Date.parse(`${previous.day}T00:00:00.000Z`) / 86_400_000)
  const currentWeekStart = currentDayNumber - currentIndex
  const previousWeekStart = previousDayNumber - WEEKDAY_INDEX[previous.weekday]
  if (previousWeekStart !== currentWeekStart) return true
  const previousIndex = WEEKDAY_INDEX[previous.weekday]
  return previousIndex < targetIndex
    || (previousIndex === targetIndex && previous.time < state.timeOfDay)
}

async function fingerprint(providerKey: string, configJson: string | null): Promise<string> {
  const data = new TextEncoder().encode(`${providerKey}\n${configJson ?? '{}'}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function contentRevision(value: Omit<PublishedAnalyticsReport, 'revision' | 'publishedAt'>): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value))
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function safeFailure(error: unknown): string {
  return error instanceof DomainError && error.code.startsWith('analytics_report_')
    ? error.message
    : 'Analytics report synchronization failed'
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function serializeReport(report: PublishedAnalyticsReport): string {
  const parsed = publishedAnalyticsReportSchema.safeParse(report)
  if (!parsed.success) {
    throw new DomainError('analytics_report_invalid', 'Analytics report is invalid', 502)
  }
  const value = JSON.stringify(parsed.data)
  if (byteLength(value) > MAX_ANALYTICS_REPORT_BYTES) {
    throw new DomainError('analytics_report_invalid', 'Analytics report exceeds the configured size limit', 502)
  }
  return value
}

function samePublishedContent(left: PublishedAnalyticsReport, right: PublishedAnalyticsReport): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.revision === right.revision
    && left.sourceRevision === right.sourceRevision
    && left.providerKey === right.providerKey
    && left.configFingerprint === right.configFingerprint
    && left.sourceGeneratedAt === right.sourceGeneratedAt
    && left.syncedThrough === right.syncedThrough
    && left.publishedArticlePageViews === right.publishedArticlePageViews
    && JSON.stringify(left.articles) === JSON.stringify(right.articles)
    && JSON.stringify(left.currentHotspots) === JSON.stringify(right.currentHotspots)
    && JSON.stringify(left.historicalHotspots) === JSON.stringify(right.historicalHotspots)
}

export function createAnalyticsReportReader(deps: {
  stateRepository: Pick<AnalyticsReportStateRepository, 'getCurrentReport'>
  articleRepository: Pick<AnalyticsReportArticleRepository, 'listPublishedArticleIds'>
}) {
  let currentReportPromise: Promise<PublishedAnalyticsReport | null> | null = null

  return {
    invalidateCurrentReport() {
      currentReportPromise = null
    },
    getCurrentReport(): Promise<PublishedAnalyticsReport | null> {
      if (!currentReportPromise) currentReportPromise = (async () => {
        const report = await deps.stateRepository.getCurrentReport()
        if (!report) return null
        const publishedIds = new Set(await deps.articleRepository.listPublishedArticleIds())
        const articles = report.articles.filter((row) => publishedIds.has(row.postId))
        return {
          ...report,
          articles,
          currentHotspots: report.currentHotspots.filter((row) => publishedIds.has(row.postId)),
          historicalHotspots: report.historicalHotspots.filter((row) => publishedIds.has(row.postId)),
          publishedArticlePageViews: articles.reduce((sum, row) => sum + row.pageViews, 0)
        }
      })().catch((error) => {
        currentReportPromise = null
        throw error
      })
      return currentReportPromise
    }
  }
}

export type AnalyticsReportReader = Pick<ReturnType<typeof createAnalyticsReportReader>, 'getCurrentReport'>

export function createAnalyticsReportService(deps: {
  stateRepository: AnalyticsReportStateRepository
  integrationRepository: IntegrationSettingsRepository
  articleRepository: AnalyticsReportArticleRepository
  createProvider: (integration: StoredIntegration) => Promise<AnalyticsReportProvider | null> | AnalyticsReportProvider | null
  /** Optional public cache — used to drop the hotspots projection after a report publish. */
  cache?: CacheProvider
}) {
  const reader = createAnalyticsReportReader(deps)
  async function selected(): Promise<{
    integration: StoredIntegration
    provider: AnalyticsReportProvider
    fingerprint: string
  } | null> {
    const integration = (await deps.integrationRepository.list())
      .find((row) => row.capability === 'analyticsReport' && row.enabled)
    if (!integration) return null
    const provider = await deps.createProvider(integration)
    if (!provider) return null
    return {
      integration,
      provider,
      fingerprint: await fingerprint(integration.providerKey, integration.publicConfigJson)
    }
  }

  async function status(now = new Date()) {
    const [state, current] = await Promise.all([deps.stateRepository.getState(), selected()])
    return {
      ...state,
      configuredProvider: current?.integration.providerKey ?? null,
      syncSupported: Boolean(current),
      due: isDue(state, now)
    }
  }

  async function normalize(
    source: Awaited<ReturnType<AnalyticsReportProvider['fetchReport']>>,
    providerKey: string,
    configFingerprint: string,
    publishedAt: Date
  ): Promise<PublishedAnalyticsReport> {
    const articleRefs = await deps.articleRepository.listAllPublishedAnalyticsArticles()
    if (articleRefs.length > MAX_ANALYTICS_REPORT_ARTICLES) {
      throw new DomainError('analytics_report_invalid', 'Analytics report contains too many published articles', 502)
    }
    const byPath = new Map(articleRefs.map((article) => [`/posts/${article.slug}`, article]))
    const views = new Map<string, number>()
    for (const row of source.articles) {
      if (views.has(row.path)) throw new DomainError('analytics_report_invalid', 'Analytics report contains duplicate article paths', 502)
      views.set(row.path, row.pageViews)
    }
    const articles = articleRefs.map((article) => ({
      postId: article.id,
      path: `/posts/${article.slug}`,
      pageViews: views.get(`/posts/${article.slug}`) ?? 0,
      publishedAt: article.publishedAt.toISOString()
    }))
    const resolveCurrent = (rows: typeof source.currentHotspots) => {
      const used = new Set<string>()
      return rows.flatMap((row) => {
        if (used.has(row.path)) {
          throw new DomainError('analytics_report_invalid', 'Analytics report contains duplicate current hotspot paths', 502)
        }
        used.add(row.path)
        const article = byPath.get(row.path)
        if (!article) return []
        return [{ postId: article.id, pageViews: row.pageViews, previousPageViews: row.previousPageViews }]
      })
    }
    const resolveHistorical = (rows: typeof source.historicalHotspots) => {
      const used = new Set<string>()
      return rows.flatMap((row) => {
        if (used.has(row.path)) {
          throw new DomainError('analytics_report_invalid', 'Analytics report contains duplicate historical hotspot paths', 502)
        }
        used.add(row.path)
        const article = byPath.get(row.path)
        if (!article) return []
        return [{ postId: article.id, pageViews: row.pageViews }]
      })
    }
    const content: Omit<PublishedAnalyticsReport, 'revision' | 'publishedAt'> = {
      schemaVersion: 1,
      sourceRevision: source.revision,
      providerKey,
      configFingerprint,
      sourceGeneratedAt: source.generatedAt,
      syncedThrough: source.syncedThrough,
      articles,
      currentHotspots: resolveCurrent(source.currentHotspots),
      historicalHotspots: resolveHistorical(source.historicalHotspots),
      publishedArticlePageViews: articles.reduce((sum, article) => sum + article.pageViews, 0)
    }
    if (byteLength(JSON.stringify(content)) > MAX_ANALYTICS_REPORT_BYTES) {
      throw new DomainError('analytics_report_invalid', 'Analytics report exceeds the configured size limit', 502)
    }
    return {
      ...content,
      revision: await contentRevision(content),
      publishedAt: publishedAt.toISOString()
    }
  }

  async function performSync(now: Date, scheduled: boolean) {
    const [state, current] = await Promise.all([deps.stateRepository.getState(), selected()])
    if (scheduled && !isDue(state, now)) return status(now)
    if (!state.enabled) throw new DomainError('analytics_report_disabled', 'Analytics report synchronization is disabled', 409)
    if (!current) {
      // Scheduled polls must not throw on permanent misconfiguration (missing provider): record the
      // failure for the admin UI and return status so the cron task stays healthy. Manual sync still
      // rejects so the operator gets an explicit API error.
      if (scheduled) {
        const skipRunId = crypto.randomUUID()
        if (await deps.stateRepository.tryStartRun(skipRunId, now, new Date(now.getTime() + SYNC_LEASE_MS))) {
          await deps.stateRepository.markFailure(
            skipRunId,
            now,
            'Analytics report provider is not configured'
          ).catch(() => false)
        }
        return status(now)
      }
      throw new DomainError('analytics_report_provider_unavailable', 'Analytics report provider is not configured', 409)
    }

    const runId = crypto.randomUUID()
    if (!await deps.stateRepository.tryStartRun(runId, now, new Date(now.getTime() + SYNC_LEASE_MS))) {
      throw new DomainError('analytics_report_busy', 'Analytics report synchronization is already running', 409)
    }
    try {
      const source = await current.provider.fetchReport()
      const latest = await selected()
      if (!latest || latest.integration.providerKey !== current.integration.providerKey
        || latest.fingerprint !== current.fingerprint
        || latest.integration.updatedAt.getTime() !== current.integration.updatedAt.getTime()) {
        throw new DomainError('analytics_report_provider_changed', 'Analytics report provider changed during synchronization', 409)
      }
      const completedAt = new Date()
      const report = await normalize(source, current.provider.providerKey, current.fingerprint, completedAt)
      const beforeActivation = await selected()
      if (!beforeActivation || beforeActivation.integration.providerKey !== current.integration.providerKey
        || beforeActivation.fingerprint !== current.fingerprint
        || beforeActivation.integration.updatedAt.getTime() !== current.integration.updatedAt.getTime()) {
        throw new DomainError('analytics_report_provider_changed', 'Analytics report provider changed during synchronization', 409)
      }
      const renewedAt = new Date()
      if (!await deps.stateRepository.renewRun(runId, renewedAt, new Date(renewedAt.getTime() + SYNC_LEASE_MS))) {
        throw new DomainError('analytics_report_lease_expired', 'Analytics report synchronization lease expired', 409)
      }

      let activatedReport = report
      const existing = await deps.stateRepository.getCurrentReport()
      if (existing?.providerKey === report.providerKey
        && existing.configFingerprint === report.configFingerprint
        && existing.revision === report.revision) {
        if (!samePublishedContent(existing, report)) {
          throw new DomainError(
            'analytics_report_invalid',
            'Analytics report content revision does not match its normalized content',
            502
          )
        }
        activatedReport = existing
      }
      const reportJson = serializeReport(activatedReport)
      const activatedAt = new Date()
      const marked = await deps.stateRepository.markSuccess({
        runId,
        providerKey: activatedReport.providerKey,
        integrationUpdatedAt: current.integration.updatedAt,
        configFingerprint: activatedReport.configFingerprint,
        revision: activatedReport.revision,
        sourceGeneratedAt: new Date(activatedReport.sourceGeneratedAt),
        publishedAt: new Date(activatedReport.publishedAt),
        completedAt: activatedAt,
        syncedThrough: activatedReport.syncedThrough,
        reportJson
      })
      if (!marked) throw new DomainError('analytics_report_lease_expired', 'Analytics report synchronization lease expired', 409)
      reader.invalidateCurrentReport()
      // Hotspots are derived from the published report; drop the shared public projection.
      await deps.cache?.delete([cacheKeys.hotspots()]).catch(() => undefined)
      return status(activatedAt)
    } catch (error) {
      await deps.stateRepository.markFailure(runId, new Date(), safeFailure(error)).catch(() => false)
      if (error instanceof DomainError) throw error
      throw new DomainError('analytics_report_sync_failed', safeFailure(error), 502)
    }
  }

  return {
    status,
    async getStatus(permissions: readonly Permission[]) {
      requireMaintenance(permissions)
      return status()
    },
    async updateSettings(input: {
      enabled: boolean
      schedule: AnalyticsReportSchedule
      timeOfDay: string
      timezone: string
      dayOfWeek: AnalyticsReportWeekday
    }, permissions: readonly Permission[]) {
      requireMaintenance(permissions)
      await deps.stateRepository.updateSettings(input)
      return status()
    },
    async sync(permissions: readonly Permission[], now = new Date()) {
      requireMaintenance(permissions)
      return performSync(now, false)
    },
    async syncDue(now = new Date()) {
      return performSync(now, true)
    },
    getCurrentReport: reader.getCurrentReport
  }
}

export type AnalyticsReportService = ReturnType<typeof createAnalyticsReportService>
