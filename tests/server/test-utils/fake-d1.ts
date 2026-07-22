import Database from 'better-sqlite3'
import type { D1Database } from '@cloudflare/workers-types'

// Minimal better-sqlite3-backed stand-in for the D1 binding surface used by the migration repository.
// batch() runs inside a single better-sqlite3 transaction so it is atomic (rolls back on any failure),
// which is what we assert about env.DB.batch().
export function createFakeD1(sqlite: Database.Database = new Database(':memory:')): {
  d1: D1Database
  sqlite: Database.Database
} {
  const prepare = (query: string) => {
    let args: unknown[] = []
    const stmt = {
      bind: (...a: unknown[]) => { args = a; return stmt },
      run: async () => { sqlite.prepare(query).run(...args); return { success: true } },
      all: async () => ({ results: sqlite.prepare(query).all(...args) }),
      first: async () => (sqlite.prepare(query).get(...args) ?? null),
      _exec: () => sqlite.prepare(query).run(...args)
    }
    return stmt
  }
  const d1 = {
    prepare,
    exec: async (query: string) => { sqlite.exec(query); return { count: 0, duration: 0 } },
    batch: async (statements: Array<{ _exec: () => unknown }>) => {
      const run = sqlite.transaction(() => statements.map((s) => s._exec()))
      run()
      return statements.map(() => ({ success: true }))
    }
  }
  return { d1: d1 as unknown as D1Database, sqlite }
}
