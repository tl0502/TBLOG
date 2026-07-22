import { createIntegrationSettingsRepository } from '../../../server/repositories/integration-settings-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

function setup() {
  const { db, sqlite } = createSqliteTestDatabase()
  return { repository: createIntegrationSettingsRepository(db as never), sqlite }
}

type ExecutableBatchStatement = { run(): unknown }

function setupWithSimulatedD1Batch(options: { failBatchAfter?: number } = {}) {
  const { db, sqlite } = createSqliteTestDatabase()
  const batchStatementCounts: number[] = []
  const d1CompatibleDb = Object.assign(db, {
    async batch(statements: readonly ExecutableBatchStatement[]) {
      batchStatementCounts.push(statements.length)
      // This verifies branch selection and rollback intent only. A better-sqlite3 transaction
      // does not reproduce deployed D1 batch semantics or its remote execution environment.
      return sqlite.transaction((items: readonly ExecutableBatchStatement[]) => (
        items.map((statement, index) => {
          const result = statement.run()
          if (options.failBatchAfter === index + 1) throw new Error('injected batch failure')
          return result
        })
      ))(statements)
    }
  })

  return {
    repository: createIntegrationSettingsRepository(d1CompatibleDb as never),
    sqlite,
    batchStatementCounts
  }
}

describe('integration settings repository', () => {
  it('returns null for an unknown capability/provider pair', async () => {
    const { repository } = setup()

    await expect(repository.findByCapabilityAndProvider('search', 'algolia')).resolves.toBeNull()
    await expect(repository.list()).resolves.toEqual([])
  })

  it('inserts a new row on first upsert', async () => {
    const { repository, sqlite } = setup()
    const updatedAt = new Date('2026-07-14T10:00:00.000Z')

    await repository.upsert({
      capability: 'commentProtection',
      providerKey: 'turnstile',
      enabled: true,
      publicConfigJson: JSON.stringify({ siteKey: 'abc' }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null,
      updatedAt
    })

    const stored = await repository.findByCapabilityAndProvider('commentProtection', 'turnstile')
    expect(stored).toEqual({
      capability: 'commentProtection',
      providerKey: 'turnstile',
      enabled: true,
      publicConfigJson: JSON.stringify({ siteKey: 'abc' }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null,
      updatedAt
    })
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM integration_settings').get()).toEqual({ n: 1 })
  })

  it('updates the existing row on conflict instead of inserting a duplicate', async () => {
    const { repository, sqlite } = setup()

    await repository.upsert({
      capability: 'search',
      providerKey: 'algolia',
      enabled: false,
      publicConfigJson: JSON.stringify({ appId: 'A1' }),
      status: 'disabled',
      lastCheckedAt: null,
      lastError: null,
      updatedAt: new Date('2026-07-14T10:00:00.000Z')
    })

    const checkedAt = new Date('2026-07-14T11:00:00.000Z')
    await repository.upsert({
      capability: 'search',
      providerKey: 'algolia',
      enabled: false,
      publicConfigJson: JSON.stringify({ appId: 'A2' }),
      status: 'unavailable',
      lastCheckedAt: checkedAt,
      lastError: 'Missing ALGOLIA_ADMIN_KEY secret',
      updatedAt: checkedAt
    })

    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM integration_settings').get()).toEqual({ n: 1 })
    await expect(
      repository.findByCapabilityAndProvider('search', 'algolia')
    ).resolves.toEqual({
      capability: 'search',
      providerKey: 'algolia',
      enabled: false,
      publicConfigJson: JSON.stringify({ appId: 'A2' }),
      status: 'unavailable',
      lastCheckedAt: checkedAt,
      lastError: 'Missing ALGOLIA_ADMIN_KEY secret',
      updatedAt: checkedAt
    })
  })

  it('updates operational status without changing the stored configuration generation', async () => {
    const { repository } = setup()
    const generation = new Date('2026-07-14T10:00:00.000Z')
    const checkedAt = new Date('2026-07-14T11:00:00.000Z')
    await repository.upsert({
      capability: 'analyticsReport',
      providerKey: 'http-analytics-report',
      enabled: true,
      publicConfigJson: '{"endpoint":"https://analytics.example.com/report"}',
      status: 'configured',
      lastCheckedAt: null,
      lastError: null,
      updatedAt: generation
    })

    await repository.upsertOperationalStatus({
      capability: 'analyticsReport',
      providerKey: 'http-analytics-report',
      enabled: false,
      publicConfigJson: '{}',
      status: 'active',
      lastCheckedAt: checkedAt,
      lastError: null,
      updatedAt: checkedAt
    })

    await expect(repository.findByCapabilityAndProvider('analyticsReport', 'http-analytics-report'))
      .resolves.toEqual({
        capability: 'analyticsReport',
        providerKey: 'http-analytics-report',
        enabled: true,
        publicConfigJson: '{"endpoint":"https://analytics.example.com/report"}',
        status: 'active',
        lastCheckedAt: checkedAt,
        lastError: null,
        updatedAt: generation
      })
  })

  it('disables other providers in the same capability when activating one provider', async () => {
    const { repository } = setup()
    const initial = new Date('2026-07-14T10:00:00.000Z')
    await repository.upsert({
      capability: 'analytics', providerKey: 'umami', enabled: true,
      publicConfigJson: '{}', status: 'configured', lastCheckedAt: null, lastError: null,
      updatedAt: initial
    })
    await repository.upsertExclusive({
      capability: 'analytics', providerKey: 'plausible', enabled: true,
      publicConfigJson: '{}', status: 'configured', lastCheckedAt: null, lastError: null,
      updatedAt: new Date(initial.getTime() + 1)
    }, 'analytics')

    await expect(repository.findByCapabilityAndProvider('analytics', 'umami')).resolves.toMatchObject({
      enabled: false, status: 'disabled'
    })
    await expect(repository.findByCapabilityAndProvider('analytics', 'plausible')).resolves.toMatchObject({
      enabled: true, status: 'configured'
    })
  })

  it('invalidates the current report snapshot when report integration configuration changes', async () => {
    const { repository, sqlite } = setup()
    sqlite.prepare(`INSERT INTO analytics_report_state
      (id, enabled, active_provider, config_fingerprint, active_revision, report_json,
       sync_run_id, sync_locked_until)
      VALUES ('default', 1, 'old-provider', ?, 'rev-1', '{}', 'run-1', ?)`)
      .run('a'.repeat(64), Date.now() + 60_000)

    await repository.upsertAnalyticsReportExclusive({
      capability: 'analyticsReport',
      providerKey: 'http-analytics-report',
      enabled: true,
      publicConfigJson: '{"endpoint":"https://analytics.example.com/report"}',
      status: 'configured',
      lastCheckedAt: null,
      lastError: null,
      updatedAt: new Date('2026-07-19T00:00:00.000Z')
    })

    expect(sqlite.prepare(`SELECT active_provider AS activeProvider, active_revision AS activeRevision,
      report_json AS reportJson, sync_run_id AS syncRunId, sync_locked_until AS syncLockedUntil
      FROM analytics_report_state WHERE id = 'default'`).get()).toEqual({
      activeProvider: null,
      activeRevision: null,
      reportJson: null,
      syncRunId: null,
      syncLockedUntil: null
    })
    await expect(repository.findByCapabilityAndProvider('analyticsReport', 'http-analytics-report'))
      .resolves.toMatchObject({ enabled: true, status: 'configured' })
  })

  it('uses one three-statement batch for an exclusive analytics report update', async () => {
    const { repository, sqlite, batchStatementCounts } = setupWithSimulatedD1Batch()
    sqlite.prepare(`INSERT INTO analytics_report_state
      (id, enabled, active_provider, config_fingerprint, active_revision, report_json)
      VALUES ('default', 1, 'old-provider', ?, 'rev-1', '{}')`)
      .run('a'.repeat(64))

    await repository.upsertAnalyticsReportExclusive({
      capability: 'analyticsReport',
      providerKey: 'http-analytics-report',
      enabled: true,
      publicConfigJson: '{"endpoint":"https://analytics.example.com/report"}',
      status: 'configured',
      lastCheckedAt: null,
      lastError: null,
      updatedAt: new Date('2026-07-19T00:00:00.000Z')
    })

    expect(batchStatementCounts).toEqual([3])
    expect(sqlite.prepare(`SELECT active_provider AS activeProvider, report_json AS reportJson
      FROM analytics_report_state WHERE id = 'default'`).get()).toEqual({
      activeProvider: null,
      reportJson: null
    })
    await expect(repository.findByCapabilityAndProvider('analyticsReport', 'http-analytics-report'))
      .resolves.toMatchObject({ enabled: true, status: 'configured' })
  })

  it('does not run the sequential fallback after an analytics report batch failure', async () => {
    const { repository, sqlite, batchStatementCounts } = setupWithSimulatedD1Batch({
      failBatchAfter: 2
    })
    const initial = new Date('2026-07-18T00:00:00.000Z')
    await repository.upsert({
      capability: 'analyticsReport',
      providerKey: 'old-provider',
      enabled: true,
      publicConfigJson: '{}',
      status: 'configured',
      lastCheckedAt: null,
      lastError: null,
      updatedAt: initial
    })
    sqlite.prepare(`INSERT INTO analytics_report_state
      (id, enabled, active_provider, config_fingerprint, active_revision, report_json)
      VALUES ('default', 1, 'old-provider', ?, 'rev-1', '{}')`)
      .run('a'.repeat(64))

    await expect(repository.upsertAnalyticsReportExclusive({
      capability: 'analyticsReport',
      providerKey: 'http-analytics-report',
      enabled: true,
      publicConfigJson: '{"endpoint":"https://analytics.example.com/report"}',
      status: 'configured',
      lastCheckedAt: null,
      lastError: null,
      updatedAt: new Date('2026-07-19T00:00:00.000Z')
    })).rejects.toThrow('injected batch failure')

    expect(batchStatementCounts).toEqual([3])
    expect(sqlite.prepare(`SELECT provider_key AS providerKey, enabled, status
      FROM integration_settings WHERE capability = 'analyticsReport'`).all()).toEqual([
      { providerKey: 'old-provider', enabled: 1, status: 'configured' }
    ])
    expect(sqlite.prepare(`SELECT active_provider AS activeProvider, active_revision AS activeRevision,
      report_json AS reportJson FROM analytics_report_state WHERE id = 'default'`).get()).toEqual({
      activeProvider: 'old-provider',
      activeRevision: 'rev-1',
      reportJson: '{}'
    })
  })

  it('lists every stored row', async () => {
    const { repository } = setup()
    const updatedAt = new Date('2026-07-14T10:00:00.000Z')

    await repository.upsert({
      capability: 'commentProtection',
      providerKey: 'turnstile',
      enabled: true,
      publicConfigJson: '{}',
      status: 'configured',
      lastCheckedAt: null,
      lastError: null,
      updatedAt
    })
    await repository.upsert({
      capability: 'search',
      providerKey: 'algolia',
      enabled: false,
      publicConfigJson: '{}',
      status: 'disabled',
      lastCheckedAt: null,
      lastError: null,
      updatedAt
    })

    const rows = await repository.list()
    expect(rows.map((row) => `${row.capability}:${row.providerKey}`).sort()).toEqual([
      'commentProtection:turnstile',
      'search:algolia'
    ])
  })

  it('advances updatedAt monotonically when invalidations share a timestamp or the clock moves backwards', async () => {
    const { repository } = setup()
    const initial = new Date('2026-07-14T10:00:00.000Z')
    await repository.upsert({
      capability: 'cache',
      providerKey: 'cloudflare-kv',
      enabled: true,
      publicConfigJson: '{}',
      status: 'configured',
      lastCheckedAt: null,
      lastError: null,
      updatedAt: initial
    })

    await repository.touch('cache', 'cloudflare-kv', initial)
    await repository.touch('cache', 'cloudflare-kv', new Date(initial.getTime() - 1000))

    const stored = await repository.findByCapabilityAndProvider('cache', 'cloudflare-kv')
    expect(stored?.updatedAt).toEqual(new Date(initial.getTime() + 2))
  })
})
