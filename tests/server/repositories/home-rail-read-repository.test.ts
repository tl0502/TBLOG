import { describe, expect, it } from 'vitest'
import { createHomeRailReadRepository } from '../../../server/repositories/home-rail-read-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

describe('home rail read repository', () => {
  it('counts and lists only published public articles', async () => {
    const { db, sqlite } = createSqliteTestDatabase()
    sqlite.prepare("insert into administrators (id, username, password_hash) values ('a1','admin','hash')").run()
    sqlite.prepare("insert into categories (id,name,slug) values ('c1','Engineering','engineering')").run()
    sqlite.prepare("insert into tags (id,name,slug) values ('t1','Nuxt','nuxt')").run()
    const published = Date.parse('2026-07-10T00:00:00Z')
    const updated = Date.parse('2026-07-15T00:00:00Z')
    sqlite.prepare("insert into posts (id,type,status,title,slug,author_id,category_id,published_at,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?)")
      .run('p1', 'article', 'published', 'Public', 'public', 'a1', 'c1', published, published, updated)
    sqlite.prepare("insert into posts (id,type,status,title,slug,author_id,published_at) values (?,?,?,?,?,?,?)")
      .run('p2', 'article', 'draft', 'Draft', 'draft', 'a1', null)
    sqlite.prepare("insert into post_tags (post_id,tag_id) values ('p1','t1')").run()
    const repository = createHomeRailReadRepository(db as never)

    await expect(repository.getContentCounts()).resolves.toEqual({ articles: 1, categories: 1, tags: 1 })
    await expect(repository.listPublishedArticleSlugs(['public', 'draft'])).resolves.toEqual(['public'])
    const signals = await repository.listArticleSignals(new Date('2026-07-01T00:00:00Z'), 10)
    expect(signals.map((signal) => signal.slug)).toEqual(['public'])
    await expect(repository.getLastPublicUpdate()).resolves.toEqual(new Date(updated))
  })

  it('batches large curated slug lookups below the D1 parameter limit', async () => {
    const { db, sqlite } = createSqliteTestDatabase()
    sqlite.prepare("insert into administrators (id, username, password_hash) values ('a1','admin','hash')").run()
    const insertPost = sqlite.prepare(
      `insert into posts (id, type, status, title, slug, author_id, published_at)
       values (?, 'article', 'published', ?, ?, 'a1', ?)`
    )
    const slugs = Array.from({ length: 161 }, (_, index) => `curated-${index}`)
    for (const [index, slug] of slugs.entries()) {
      insertPost.run(slug, `Curated ${index}`, slug, Date.now() + index)
    }

    const repository = createHomeRailReadRepository(db as never)

    await expect(repository.listPublishedArticleSlugs([...slugs].reverse()))
      .resolves.toEqual([...slugs].reverse())
  })
})
