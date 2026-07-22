import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../../server/database/schema'
import { readGeneratedMigrationSql } from './migrations'

export type TestDatabase = BetterSQLite3Database<typeof schema>

export function createSqliteTestDatabase(): { db: TestDatabase; sqlite: Database.Database } {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(readGeneratedMigrationSql())
  const db = drizzle(sqlite, { schema })

  return { db, sqlite }
}
