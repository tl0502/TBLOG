import { describe, expect, it } from 'vitest'
import type { PublishedAnalyticsReport } from '../../../server/domain/analytics-report'
import { createAnalyticsReportStateRepository } from '../../../server/repositories/analytics-report-state-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

const generation = new Date('2026-07-19T00:00:00.000Z')

function report(revision = 'rev-active'): PublishedAnalyticsReport {
  return {
    schemaVersion: 1,
    revision,
    sourceRevision: 'source-1',
    providerKey: 'provider',
    configFingerprint: 'a'.repeat(64),
    sourceGeneratedAt: '2026-07-18T00:00:00.000Z',
    publishedAt: '2026-07-19T00:00:00.000Z',
    syncedThrough: '2026-07-18',
    articles: [{
      postId: 'post-1', path: '/posts/post-1', pageViews: 12,
      publishedAt: '2026-07-10T00:00:00.000Z'
    }],
    currentHotspots: [],
    historicalHotspots: [],
    publishedArticlePageViews: 12
  }
}

function seedIntegration(sqlite: ReturnType<typeof createSqliteTestDatabase>['sqlite'], updatedAt = generation) {
  sqlite.prepare(`INSERT INTO integration_settings
    (id, capability, provider_key, enabled, status, updated_at)
    VALUES (?, 'analyticsReport', 'provider', 1, 'active', ?)`)
    .run('report-provider', updatedAt.getTime())
}

function successInput(runId: string, value = report()) {
  return {
    runId,
    providerKey: value.providerKey,
    integrationUpdatedAt: generation,
    configFingerprint: value.configFingerprint,
    revision: value.revision,
    sourceGeneratedAt: new Date(value.sourceGeneratedAt),
    publishedAt: new Date(value.publishedAt),
    completedAt: new Date('2026-07-19T00:05:00.000Z'),
    syncedThrough: value.syncedThrough,
    reportJson: JSON.stringify(value)
  }
}

describe('analytics report state repository', () => {
  it('atomically activates the snapshot only for the current enabled integration generation', async () => {
    const { db, sqlite } = createSqliteTestDatabase()
    seedIntegration(sqlite)
    const repository = createAnalyticsReportStateRepository(db as never)
    const startedAt = new Date('2026-07-19T00:00:00.000Z')
    const lockedUntil = new Date('2026-07-19T00:10:00.000Z')

    await repository.updateSettings({
      enabled: true, schedule: 'weekly', timeOfDay: '03:00', timezone: 'UTC', dayOfWeek: 'fri'
    })
    await expect(repository.tryStartRun('run-1', startedAt, lockedUntil)).resolves.toBe(true)
    await expect(repository.markSuccess(successInput('run-1'))).resolves.toBe(true)
    await expect(repository.getState()).resolves.toMatchObject({
      schedule: 'weekly', dayOfWeek: 'fri', activeRevision: 'rev-active'
    })
    await expect(repository.getCurrentReport()).resolves.toEqual(report())
  })

  it('preserves the previous snapshot when the lease expires', async () => {
    const { db, sqlite } = createSqliteTestDatabase()
    seedIntegration(sqlite)
    const repository = createAnalyticsReportStateRepository(db as never)
    await repository.updateSettings({
      enabled: true, schedule: 'daily', timeOfDay: '03:00', timezone: 'UTC', dayOfWeek: 'mon'
    })
    await repository.tryStartRun('run-1', new Date('2026-07-19T00:00:00.000Z'), new Date('2026-07-19T00:10:00.000Z'))
    await repository.markSuccess(successInput('run-1'))

    await repository.tryStartRun('run-2', new Date('2026-07-19T00:11:00.000Z'), new Date('2026-07-19T00:12:00.000Z'))
    await expect(repository.markSuccess({
      ...successInput('run-2', report('rev-rejected')),
      completedAt: new Date('2026-07-19T00:12:00.001Z')
    })).resolves.toBe(false)
    await expect(repository.getCurrentReport()).resolves.toEqual(report())
  })

  it('preserves the previous snapshot when reporting is disabled or the integration generation changes', async () => {
    for (const mutate of [
      (sqlite: ReturnType<typeof createSqliteTestDatabase>['sqlite']) => sqlite.prepare(
        `UPDATE analytics_report_state SET enabled = 0 WHERE id = 'default'`
      ).run(),
      (sqlite: ReturnType<typeof createSqliteTestDatabase>['sqlite']) => sqlite.prepare(
        `UPDATE integration_settings SET updated_at = updated_at + 1 WHERE id = 'report-provider'`
      ).run()
    ]) {
      const { db, sqlite } = createSqliteTestDatabase()
      seedIntegration(sqlite)
      const repository = createAnalyticsReportStateRepository(db as never)
      await repository.updateSettings({
        enabled: true, schedule: 'daily', timeOfDay: '03:00', timezone: 'UTC', dayOfWeek: 'mon'
      })
      await repository.tryStartRun('run-1', new Date('2026-07-19T00:00:00.000Z'), new Date('2026-07-19T00:10:00.000Z'))
      await repository.markSuccess(successInput('run-1'))
      await repository.tryStartRun('run-2', new Date('2026-07-19T00:11:00.000Z'), new Date('2026-07-19T00:20:00.000Z'))
      mutate(sqlite)

      await expect(repository.markSuccess(successInput('run-2', report('rev-rejected')))).resolves.toBe(false)
      const raw = sqlite.prepare(`SELECT active_revision AS revision, report_json AS reportJson
        FROM analytics_report_state WHERE id = 'default'`).get() as { revision: string; reportJson: string }
      expect(raw.revision).toBe('rev-active')
      expect(JSON.parse(raw.reportJson)).toEqual(report())
    }
  })

  it('returns null for disabled, malformed, oversized, or identity-mismatched snapshots', async () => {
    const { db, sqlite } = createSqliteTestDatabase()
    const repository = createAnalyticsReportStateRepository(db as never)
    await repository.updateSettings({
      enabled: true, schedule: 'off', timeOfDay: '03:00', timezone: 'UTC', dayOfWeek: 'mon'
    })

    for (const value of ['not-json', JSON.stringify({ invalid: true }), 'x'.repeat(524_289)]) {
      sqlite.prepare(`UPDATE analytics_report_state SET report_json = ?, active_provider = 'provider',
        config_fingerprint = ?, active_revision = 'rev-active' WHERE id = 'default'`)
        .run(value, 'a'.repeat(64))
      await expect(repository.getCurrentReport()).resolves.toBeNull()
    }

    sqlite.prepare(`UPDATE analytics_report_state SET report_json = ?, active_revision = 'different'
      WHERE id = 'default'`).run(JSON.stringify(report()))
    await expect(repository.getCurrentReport()).resolves.toBeNull()
  })

  it('cannot renew a lease after it expires or from a different run', async () => {
    const { db } = createSqliteTestDatabase()
    const repository = createAnalyticsReportStateRepository(db as never)
    const startedAt = new Date('2026-07-19T00:00:00.000Z')
    const lockedUntil = new Date('2026-07-19T00:10:00.000Z')

    await expect(repository.tryStartRun('run-1', startedAt, lockedUntil)).resolves.toBe(true)
    await expect(repository.renewRun('run-2', startedAt, lockedUntil)).resolves.toBe(false)
    await expect(repository.renewRun(
      'run-1',
      new Date('2026-07-19T00:10:00.001Z'),
      new Date('2026-07-19T00:20:00.000Z')
    )).resolves.toBe(false)
  })
})
