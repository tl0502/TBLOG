import { createFakeD1 } from '../test-utils/fake-d1'
import {
  createD1MigrationRepository,
  splitMigrationStatements
} from '../../../server/repositories/d1-migration-repository'

describe('splitMigrationStatements', () => {
  it('splits on the breakpoint marker and drops blank/comment-only parts', () => {
    const sql = "CREATE TABLE a (id text);--> statement-breakpoint\n-- just a comment\n--> statement-breakpoint\nINSERT INTO a VALUES ('x');"
    expect(splitMigrationStatements(sql)).toEqual([
      'CREATE TABLE a (id text);',
      "INSERT INTO a VALUES ('x');"
    ])
  })
  it('returns no statements for an empty or comment-only migration', () => {
    expect(splitMigrationStatements('   \n-- nothing here\n')).toEqual([])
  })
})

describe('D1MigrationRepository', () => {
  it('creates the wrangler-compatible ledger idempotently', async () => {
    const { d1, sqlite } = createFakeD1()
    const repo = createD1MigrationRepository(d1)
    await repo.ensureLedger()
    await repo.ensureLedger()
    const cols = sqlite.prepare('PRAGMA table_info(d1_migrations)').all() as Array<{ name: string }>
    expect(cols.map((c) => c.name)).toEqual(['id', 'name', 'applied_at'])
  })

  it('applies a migration and records its ledger row atomically', async () => {
    const { d1, sqlite } = createFakeD1()
    const repo = createD1MigrationRepository(d1)
    await repo.ensureLedger()
    await repo.applyOne({
      name: '0001_demo.sql',
      sql: 'CREATE TABLE demo (id text);--> statement-breakpoint\nCREATE INDEX demo_id ON demo (id);'
    })
    expect(await repo.appliedNames()).toEqual(new Set(['0001_demo.sql']))
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='demo'").get()).toBeTruthy()
  })

  it('applies several migrations and ledger rows in one batch', async () => {
    const { d1, sqlite } = createFakeD1()
    const repo = createD1MigrationRepository(d1)
    await repo.ensureLedger()
    await repo.applyBatch([
      { name: '0001_a.sql', sql: 'CREATE TABLE a (id text);' },
      { name: '0002_b.sql', sql: 'CREATE TABLE b (id text);' }
    ])
    expect(await repo.appliedNames()).toEqual(new Set(['0001_a.sql', '0002_b.sql']))
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='a'").get()).toBeTruthy()
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='b'").get()).toBeTruthy()
  })

  it('rolls back every migration and ledger row when a grouped batch fails', async () => {
    const { d1, sqlite } = createFakeD1()
    const repo = createD1MigrationRepository(d1)
    await repo.ensureLedger()
    await expect(repo.applyBatch([
      { name: '0001_a.sql', sql: 'CREATE TABLE a (id text);' },
      { name: '0002_bad.sql', sql: 'CREATE TABLE a (id text);' }
    ])).rejects.toThrow()
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='a'").get()).toBeUndefined()
    expect(await repo.appliedNames()).toEqual(new Set())
  })

  it('rolls back the whole migration when any statement fails (nothing applied, no ledger row)', async () => {
    const { d1, sqlite } = createFakeD1()
    const repo = createD1MigrationRepository(d1)
    await repo.ensureLedger()
    await expect(repo.applyOne({
      name: '0002_bad.sql',
      sql: 'CREATE TABLE good (id text);--> statement-breakpoint\nCREATE TABLE good (id text);' // duplicate -> error
    })).rejects.toThrow()
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='good'").get()).toBeUndefined()
    expect(await repo.appliedNames()).toEqual(new Set())
  })

  it('applies an empty/comment-only migration as a no-op that still records the ledger row', async () => {
    const { d1 } = createFakeD1()
    const repo = createD1MigrationRepository(d1)
    await repo.ensureLedger()
    await repo.applyOne({ name: '0003_noop.sql', sql: '-- nothing\n' })
    expect(await repo.appliedNames()).toEqual(new Set(['0003_noop.sql']))
  })

  it('reports table existence for the bootstrap window check', async () => {
    const { d1 } = createFakeD1()
    const repo = createD1MigrationRepository(d1)
    expect(await repo.tableExists('administrators')).toBe(false)
    await repo.ensureLedger()
    expect(await repo.tableExists('d1_migrations')).toBe(true)
  })
})
