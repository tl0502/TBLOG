import { vi } from 'vitest'
import { createFakeD1 } from '../test-utils/fake-d1'

// The middleware module calls the global Nitro `defineEventHandler` for its default export at import
// time. The repo's existing API-handler tests shim it as a global via vi.hoisted; do the same here so
// the module (and its named `evaluateGuard`/`isGuardAllowlisted` exports) can be imported.
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

import { __resetGuardCacheForTests, isGuardAllowlisted, evaluateGuard } from '../../../server/middleware/pending-migration-guard'

describe('pending-migration guard', () => {
  it('allowlists admin, setup, health, and nuxt asset paths', () => {
    for (const p of ['/api/v1/health', '/api/v1/admin/maintenance/db-migrations', '/admin/settings', '/_nuxt/x.js']) {
      expect(isGuardAllowlisted(p)).toBe(true)
    }
    for (const p of ['/', '/posts/hello', '/api/v1/posts', '/rss.xml']) {
      expect(isGuardAllowlisted(p)).toBe(false)
    }
  })

  it('blocks a public route while the database is behind, and passes when current', async () => {
    __resetGuardCacheForTests()
    const { d1, sqlite } = createFakeD1()
    // Behind: only the ledger + nothing applied.
    expect(await evaluateGuard(d1, '/')).toEqual({ blocked: true })
    // Bring current by recording every manifest migration as applied.
    const { migrationsManifest } = await import('../../../server/database/migrations-manifest')
    sqlite.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)')
    const insert = sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)')
    for (const m of migrationsManifest) insert.run(m.name)
    __resetGuardCacheForTests()
    expect(await evaluateGuard(d1, '/')).toEqual({ blocked: false })
  })

  it('fails closed (blocks) when the database has drifted ahead of the code', async () => {
    __resetGuardCacheForTests()
    const { d1, sqlite } = createFakeD1()
    sqlite.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)')
    // A migration recorded as applied that this build does not know about => migrations_ahead_of_code,
    // a confirmed-incompatible state. The guard must fail CLOSED here, not fall through to fail-open.
    sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run('9999_from_a_newer_build.sql')
    expect(await evaluateGuard(d1, '/')).toEqual({ blocked: true })
  })
})
