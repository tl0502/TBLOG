import { and, eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { analyticsReportState, integrationSettings } from '../database/schema'
import { ANALYTICS_REPORT_STATE_ID } from '../domain/analytics-report'
import type {
  IntegrationSettingsRepository,
  StoredIntegration,
  UpsertIntegrationRecord
} from './contracts/integration-repositories'

const columns = {
  capability: integrationSettings.capability,
  providerKey: integrationSettings.providerKey,
  enabled: integrationSettings.enabled,
  publicConfigJson: integrationSettings.publicConfigJson,
  status: integrationSettings.status,
  lastCheckedAt: integrationSettings.lastCheckedAt,
  lastError: integrationSettings.lastError,
  updatedAt: integrationSettings.updatedAt
} as const

function toStored(row: StoredIntegration): StoredIntegration {
  return row
}

export function createIntegrationSettingsRepository(
  db: AppDatabase
): IntegrationSettingsRepository & Required<Pick<
  IntegrationSettingsRepository,
  'upsertAnalyticsReportExclusive' | 'upsertOperationalStatus'
>> {
  function upsertStatement(record: UpsertIntegrationRecord) {
    return db
      .insert(integrationSettings)
      .values({
        id: crypto.randomUUID(),
        capability: record.capability,
        providerKey: record.providerKey,
        enabled: record.enabled,
        publicConfigJson: record.publicConfigJson,
        status: record.status,
        lastCheckedAt: record.lastCheckedAt,
        lastError: record.lastError,
        updatedAt: record.updatedAt
      })
      .onConflictDoUpdate({
        target: [integrationSettings.capability, integrationSettings.providerKey],
        set: {
          enabled: record.enabled,
          publicConfigJson: record.publicConfigJson,
          status: record.status,
          lastCheckedAt: record.lastCheckedAt,
          lastError: record.lastError,
          updatedAt: sql`max(${integrationSettings.updatedAt} + 1, excluded.updated_at)`
        }
      })
  }

  function disableOtherProviders(record: UpsertIntegrationRecord, capability: string) {
    return db
      .update(integrationSettings)
      .set({
        enabled: false,
        status: 'disabled',
        lastCheckedAt: null,
        lastError: null,
        updatedAt: sql`max(${integrationSettings.updatedAt} + 1, ${record.updatedAt.getTime()})`
      })
      .where(
        and(
          eq(integrationSettings.capability, capability),
          sql`${integrationSettings.providerKey} <> ${record.providerKey}`
        )
      )
  }

  async function executeAtomic(queries: readonly [unknown, ...unknown[]]) {
    const batch = (db as AppDatabase & {
      batch?: (statements: readonly [unknown, ...unknown[]]) => Promise<unknown>
    }).batch

    if (batch) {
      await batch.call(db, queries)
      return true
    }
    return false
  }

  return {
    async list() {
      const rows = await db.select(columns).from(integrationSettings)
      return rows.map(toStored)
    },

    async findByCapabilityAndProvider(capability, providerKey) {
      const [row] = await db
        .select(columns)
        .from(integrationSettings)
        .where(
          and(
            eq(integrationSettings.capability, capability),
            eq(integrationSettings.providerKey, providerKey)
          )
        )
        .limit(1)

      return row ? toStored(row) : null
    },

    // D1 has no interactive transactions; a single INSERT ... ON CONFLICT DO UPDATE is atomic and safe.
    async upsert(record: UpsertIntegrationRecord) {
      await upsertStatement(record)
    },

    async upsertOperationalStatus(record: UpsertIntegrationRecord) {
      await db
        .insert(integrationSettings)
        .values({
          id: crypto.randomUUID(),
          capability: record.capability,
          providerKey: record.providerKey,
          enabled: record.enabled,
          publicConfigJson: record.publicConfigJson,
          status: record.status,
          lastCheckedAt: record.lastCheckedAt,
          lastError: record.lastError,
          updatedAt: record.updatedAt
        })
        .onConflictDoUpdate({
          target: [integrationSettings.capability, integrationSettings.providerKey],
          set: {
            status: record.status,
            lastCheckedAt: record.lastCheckedAt,
            lastError: record.lastError
          }
        })
    },

    async upsertExclusive(record: UpsertIntegrationRecord, capability: string) {
      const disableOthers = disableOtherProviders(record, capability)
      if (await executeAtomic([disableOthers, upsertStatement(record)] as const)) {
        // D1 guarantees db.batch() is atomic. Keep the disable and activation in one batch so
        // public reads can never observe two enabled analytics providers after a successful save.
        return
      }

      // Better-SQLite test databases do not expose D1's batch API. Production always takes the
      // atomic branch above; this fallback keeps focused repository tests executable locally.
      await disableOthers
      await upsertStatement(record)
    },

    async upsertAnalyticsReportExclusive(record) {
      const disableOthers = disableOtherProviders(record, 'analyticsReport')
      const invalidateSnapshot = db.update(analyticsReportState).set({
        activeProvider: null,
        configFingerprint: null,
        activeRevision: null,
        sourceGeneratedAt: null,
        publishedAt: null,
        syncedThrough: null,
        reportJson: null,
        syncRunId: null,
        syncLockedUntil: null,
        updatedAt: record.updatedAt
      }).where(eq(analyticsReportState.id, ANALYTICS_REPORT_STATE_ID))

      if (await executeAtomic([disableOthers, upsertStatement(record), invalidateSnapshot] as const)) return

      // Better-SQLite test databases do not expose D1 batch. Production executes the three
      // statements atomically; the sequential fallback keeps repository tests representative.
      await disableOthers
      await upsertStatement(record)
      await invalidateSnapshot
    },

    async touch(capability, providerKey, updatedAt) {
      await db
        .update(integrationSettings)
        // A cache generation must move forward even when two invalidations share the same
        // millisecond or a runtime clock moves backwards. Keep the bump in one atomic statement.
        .set({
          updatedAt: sql`max(${integrationSettings.updatedAt} + 1, ${updatedAt.getTime()})`
        })
        .where(
          and(
            eq(integrationSettings.capability, capability),
            eq(integrationSettings.providerKey, providerKey)
          )
        )
    }
  }
}
