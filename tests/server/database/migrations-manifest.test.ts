import { migrationsManifest } from '../../../server/database/migrations-manifest'

describe('migrations manifest', () => {
  it('embeds every migration file name and raw sql, sorted ascending', () => {
    expect(migrationsManifest.length).toBeGreaterThanOrEqual(31)
    const names = migrationsManifest.map((m) => m.name)
    expect(names).toEqual([...names].sort())
    expect(names.every((n) => n.endsWith('.sql'))).toBe(true)
    expect(names[0]).toBe('0000_known_post.sql')
  })

  it('carries raw file contents without parsing statements', () => {
    const first = migrationsManifest[0]
    expect(first.sql).toContain('CREATE TABLE `administrators`')
    expect(first.sql).toContain('--> statement-breakpoint')
  })
})
