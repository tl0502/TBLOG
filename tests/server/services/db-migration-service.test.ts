import { createFakeD1 } from '../test-utils/fake-d1'
import { createD1MigrationRepository } from '../../../server/repositories/d1-migration-repository'
import { createDbMigrationService } from '../../../server/services/db-migration-service'
import type { EmbeddedMigration } from '../../../server/database/migrations-manifest'

const manifest: EmbeddedMigration[] = [
  { name: '0000_a.sql', sql: 'CREATE TABLE a (id text);' },
  { name: '0001_b.sql', sql: 'CREATE TABLE b (id text);' },
  { name: '0002_c.sql', sql: 'CREATE TABLE c (id text);' }
]
function build(m: EmbeddedMigration[] = manifest) {
  const { d1, sqlite } = createFakeD1()
  const repository = createD1MigrationRepository(d1)
  return { service: createDbMigrationService({ repository, manifest: m }), sqlite, repository }
}

describe('db migration service', () => {
  it('reports version fields for an empty database', async () => {
    const { service } = build()
    const status = await service.getStatus()
    expect(status).toMatchObject({ currentVersion: 0, latestVersion: 2, appliedCount: 0, pendingCount: 3 })
    expect(status.pending).toEqual(['0000_a.sql', '0001_b.sql', '0002_c.sql'])
  })

  it('applies pending in order and is a no-op when re-run', async () => {
    const { service } = build()
    const first = await service.applyPending()
    expect(first.appliedNow).toEqual(['0000_a.sql', '0001_b.sql', '0002_c.sql'])
    expect((await service.getStatus())).toMatchObject({ currentVersion: 2, pendingCount: 0 })
    const second = await service.applyPending()
    expect(second.appliedNow).toEqual([])
  })

  it('applies a setup batch without exceeding the statement limit', async () => {
    const setupManifest: EmbeddedMigration[] = [
      { name: '0000_a.sql', sql: 'CREATE TABLE a (id text);--> statement-breakpoint\nCREATE INDEX a_id ON a (id);' },
      { name: '0001_b.sql', sql: 'CREATE TABLE b (id text);--> statement-breakpoint\nCREATE INDEX b_id ON b (id);' },
      { name: '0002_c.sql', sql: 'CREATE TABLE c (id text);' }
    ]
    const { service } = build(setupManifest)
    const result = await service.applySetupBatch()
    expect(result.appliedNow).toEqual(setupManifest.map((migration) => migration.name))
    expect(result.pending).toEqual([])
  })

  it('keeps a migration whole when the next one would exceed the setup limit', async () => {
    const firstSql = Array.from({ length: 43 }, (_, index) => `CREATE TABLE a${index} (id text);`).join('--> statement-breakpoint\n')
    const setupManifest: EmbeddedMigration[] = [
      { name: '0000_large.sql', sql: firstSql },
      { name: '0001_next.sql', sql: 'CREATE TABLE next (id text);' }
    ]
    const { service } = build(setupManifest)
    const first = await service.applySetupBatch()
    expect(first.appliedNow).toEqual(['0000_large.sql'])
    expect(first.pending).toEqual(['0001_next.sql'])
    const second = await service.applySetupBatch()
    expect(second.appliedNow).toEqual(['0001_next.sql'])
    expect(second.pending).toEqual([])
  })

  it('rejects a single migration larger than the setup batch limit', async () => {
    const statements = Array.from({ length: 45 }, (_, index) => `CREATE TABLE t${index} (id text);`).join('--> statement-breakpoint\n')
    const { service } = build([{ name: '0000_large.sql', sql: statements }])
    await expect(service.applySetupBatch()).rejects.toMatchObject({
      code: 'migration_batch_too_large',
      details: { statementCount: 46, limit: 45 }
    })
  })

  it('stops at the first failing migration and reports it', async () => {
    const bad = [...manifest, { name: '0003_bad.sql', sql: 'CREATE TABLE a (id text);' }] // 'a' already exists
    const { service } = build(bad)
    const result = await service.applyPending()
    expect(result.appliedNow).toEqual(['0000_a.sql', '0001_b.sql', '0002_c.sql'])
    expect(result.failed?.migrations).toEqual(['0003_bad.sql'])
  })

  it('reports the whole failed setup batch because D1 batches roll back atomically', async () => {
    const bad = [
      { name: '0000_a.sql', sql: 'CREATE TABLE a (id text);' },
      { name: '0001_bad.sql', sql: 'CREATE TABLE a (id text);' }
    ]
    const { service } = build(bad)
    const result = await service.applySetupBatch()
    expect(result.appliedNow).toEqual([])
    expect(result.failed?.migrations).toEqual(['0000_a.sql', '0001_bad.sql'])
    expect(result.pending).toEqual(['0000_a.sql', '0001_bad.sql'])
  })

  it('refuses when the database is ahead of the code', async () => {
    const { service, repository } = build()
    await repository.ensureLedger()
    await repository.applyOne({ name: '9999_future.sql', sql: 'CREATE TABLE z (id text);' })
    await expect(service.getStatus()).rejects.toMatchObject({ code: 'migrations_ahead_of_code' })
  })

  it('refuses on corrupted history (a gap in applied migrations)', async () => {
    const { service, repository } = build()
    await repository.ensureLedger()
    await repository.applyOne(manifest[0]) // 0000
    await repository.applyOne(manifest[2]) // 0002 applied while 0001 is not -> gap
    await expect(service.getStatus()).rejects.toMatchObject({ code: 'migration_history_corrupted' })
  })

  it('detects a missing administrators table as uninitialized', async () => {
    const { service, repository } = build()
    expect(await service.isDatabaseUninitialized()).toBe(true)
    await repository.ensureLedger()
    await repository.applyOne({ name: '0000_a.sql', sql: 'CREATE TABLE administrators (id text);' })
    expect(await service.isDatabaseUninitialized()).toBe(false)
  })

  it('serializes concurrent applyPending calls without double-applying', async () => {
    const { service } = build()
    const [a, b] = await Promise.all([service.applyPending(), service.applyPending()])
    const appliedTotal = [...a.appliedNow, ...b.appliedNow]
    expect([...new Set(appliedTotal)].sort()).toEqual(['0000_a.sql', '0001_b.sql', '0002_c.sql'])
    expect(appliedTotal.length).toBe(3) // each applied exactly once
    expect((await service.getStatus()).pendingCount).toBe(0)
  })
})
