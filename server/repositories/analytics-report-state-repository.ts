import { and, eq, exists, gte, isNull, lte, or } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { analyticsReportState, integrationSettings } from '../database/schema'
import {
  ANALYTICS_REPORT_STATE_ID,
  EMPTY_ANALYTICS_REPORT_STATE,
  MAX_ANALYTICS_REPORT_BYTES,
  publishedAnalyticsReportSchema,
  type AnalyticsReportSchedule,
  type AnalyticsReportWeekday,
  type PublishedAnalyticsReport,
  type AnalyticsReportState
} from '../domain/analytics-report'
import type { AnalyticsReportStateRepository } from './contracts/analytics-report-repositories'

function mapState(row: typeof analyticsReportState.$inferSelect | undefined): AnalyticsReportState {
  if (!row) return EMPTY_ANALYTICS_REPORT_STATE
  return {
    enabled: row.enabled,
    schedule: row.schedule as AnalyticsReportSchedule,
    timeOfDay: row.timeOfDay,
    timezone: row.timezone,
    dayOfWeek: row.dayOfWeek as AnalyticsReportWeekday,
    activeProvider: row.activeProvider,
    configFingerprint: row.configFingerprint,
    activeRevision: row.activeRevision,
    sourceGeneratedAt: row.sourceGeneratedAt,
    publishedAt: row.publishedAt,
    syncedThrough: row.syncedThrough,
    lastAttemptAt: row.lastAttemptAt,
    lastSuccessAt: row.lastSuccessAt,
    lastFailureAt: row.lastFailureAt,
    lastError: row.lastError
  }
}

function mapReport(row: Pick<typeof analyticsReportState.$inferSelect,
  'enabled' | 'activeProvider' | 'configFingerprint' | 'activeRevision' | 'reportJson'> | undefined
): PublishedAnalyticsReport | null {
  if (!row?.enabled || !row.reportJson) return null
  if (new TextEncoder().encode(row.reportJson).byteLength > MAX_ANALYTICS_REPORT_BYTES) return null
  try {
    const parsed = publishedAnalyticsReportSchema.safeParse(JSON.parse(row.reportJson))
    if (!parsed.success) return null
    if (parsed.data.providerKey !== row.activeProvider
      || parsed.data.configFingerprint !== row.configFingerprint
      || parsed.data.revision !== row.activeRevision) return null
    return parsed.data
  } catch {
    return null
  }
}

export function createAnalyticsReportStateRepository(db: AppDatabase): AnalyticsReportStateRepository {
  async function read() {
    return mapState(await db.query.analyticsReportState.findFirst({
      where: eq(analyticsReportState.id, ANALYTICS_REPORT_STATE_ID)
    }))
  }

  return {
    getState: read,
    async getCurrentReport() {
      return mapReport(await db.query.analyticsReportState.findFirst({
        where: eq(analyticsReportState.id, ANALYTICS_REPORT_STATE_ID),
        columns: {
          enabled: true,
          activeProvider: true,
          configFingerprint: true,
          activeRevision: true,
          reportJson: true
        }
      }))
    },
    async updateSettings(input) {
      await db.insert(analyticsReportState).values({ id: ANALYTICS_REPORT_STATE_ID, ...input })
        .onConflictDoUpdate({
          target: analyticsReportState.id,
          set: { ...input, updatedAt: new Date() }
        })
      return read()
    },
    async tryStartRun(runId, now, lockedUntil) {
      await db.insert(analyticsReportState).values({ id: ANALYTICS_REPORT_STATE_ID }).onConflictDoNothing()
      const rows = await db.update(analyticsReportState)
        .set({ syncRunId: runId, syncLockedUntil: lockedUntil, lastAttemptAt: now, updatedAt: now })
        .where(and(
          eq(analyticsReportState.id, ANALYTICS_REPORT_STATE_ID),
          or(isNull(analyticsReportState.syncLockedUntil), lte(analyticsReportState.syncLockedUntil, now))
        ))
        .returning({ id: analyticsReportState.id })
      return rows.length > 0
    },
    async renewRun(runId, now, lockedUntil) {
      const rows = await db.update(analyticsReportState)
        .set({ syncLockedUntil: lockedUntil, updatedAt: now })
        .where(and(
          eq(analyticsReportState.id, ANALYTICS_REPORT_STATE_ID),
          eq(analyticsReportState.syncRunId, runId),
          gte(analyticsReportState.syncLockedUntil, now)
        ))
        .returning({ id: analyticsReportState.id })
      return rows.length > 0
    },
    async markSuccess(input) {
      const selectedIntegration = db.select({ providerKey: integrationSettings.providerKey })
        .from(integrationSettings)
        .where(and(
          eq(integrationSettings.capability, 'analyticsReport'),
          eq(integrationSettings.providerKey, input.providerKey),
          eq(integrationSettings.enabled, true),
          eq(integrationSettings.updatedAt, input.integrationUpdatedAt)
        ))
        .limit(1)
      const rows = await db.update(analyticsReportState).set({
        activeProvider: input.providerKey,
        configFingerprint: input.configFingerprint,
        activeRevision: input.revision,
        sourceGeneratedAt: input.sourceGeneratedAt,
        publishedAt: input.publishedAt,
        syncedThrough: input.syncedThrough,
        reportJson: input.reportJson,
        lastSuccessAt: input.completedAt,
        lastFailureAt: null,
        lastError: null,
        syncRunId: null,
        syncLockedUntil: null,
        updatedAt: input.completedAt
      }).where(and(
        eq(analyticsReportState.id, ANALYTICS_REPORT_STATE_ID),
        eq(analyticsReportState.syncRunId, input.runId),
        gte(analyticsReportState.syncLockedUntil, input.completedAt),
        eq(analyticsReportState.enabled, true),
        exists(selectedIntegration)
      )).returning({ id: analyticsReportState.id })
      return rows.length > 0
    },
    async markFailure(runId, now, message) {
      const rows = await db.update(analyticsReportState).set({
        lastFailureAt: now,
        lastError: message.slice(0, 500),
        syncRunId: null,
        syncLockedUntil: null,
        updatedAt: now
      }).where(and(
        eq(analyticsReportState.id, ANALYTICS_REPORT_STATE_ID),
        eq(analyticsReportState.syncRunId, runId)
      )).returning({ id: analyticsReportState.id })
      return rows.length > 0
    }
  }
}
