import type { D1Database } from '@cloudflare/workers-types'
import type { EmbeddedMigration } from '../database/migrations-manifest'
import type { MigrationRepository } from './contracts/migration-repository'

const LEDGER_DDL =
  'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)'

/** Split on drizzle's breakpoint marker, dropping whitespace- and comment-only parts. */
export function splitMigrationStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((part) => part.trim())
    .filter((part) => {
      const meaningful = part
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('--'))
      return meaningful.length > 0
    })
}

export function createD1MigrationRepository(binding: D1Database): MigrationRepository {
  if (!binding) throw new Error('D1 binding DB is not available')
  async function applyBatch(migrations: ReadonlyArray<EmbeddedMigration>): Promise<void> {
    const statements = migrations.flatMap((migration) => [
      ...splitMigrationStatements(migration.sql).map((sql) => binding.prepare(sql)),
      binding.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(migration.name)
    ])
    if (statements.length === 0) return
    await binding.batch(statements)
  }

  return {
    async ensureLedger() {
      // Runs on every call by design: Worker isolates are short-lived and IF NOT EXISTS is cheap.
      await binding.prepare(LEDGER_DDL).run()
    },
    async appliedNames() {
      const { results } = await binding.prepare('SELECT name FROM d1_migrations').all<{ name: string }>()
      return new Set(results.map((row) => row.name))
    },
    async tableExists(name: string) {
      const row = await binding
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .bind(name)
        .first<{ name: string }>()
      return row != null
    },
    statementCount(migration) {
      return splitMigrationStatements(migration.sql).length
    },
    async applyOne(migration: EmbeddedMigration) {
      await applyBatch([migration])
    },
    applyBatch
  }
}
