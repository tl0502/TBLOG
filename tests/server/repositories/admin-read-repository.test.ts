import { createAdminReadRepository } from '../../../server/repositories/admin-read-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

const JUN = new Date('2026-06-01T00:00:00.000Z')

function seed(sqlite: ReturnType<typeof createSqliteTestDatabase>['sqlite']) {
  sqlite.exec(`
    INSERT INTO administrators (id, username, password_hash) VALUES ('admin-1', 'admin', 'hash');
    INSERT INTO categories (id, name, slug) VALUES ('cat1', 'Cat One', 'cat1'), ('cat2', 'Cat Two', 'cat2');
    INSERT INTO tags (id, name, slug) VALUES ('t1', 'Tag One', 't1'), ('t2', 'Tag Two', 't2'), ('t3', 'Tag Three', 't3');
  `)

  const insertPost = sqlite.prepare(
    `INSERT INTO posts (id, type, status, title, slug, author_id, category_id, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  insertPost.run('a', 'article', 'published', 'A', 'a', 'admin-1', 'cat1', JUN.getTime())
  insertPost.run('b', 'article', 'published', 'B', 'b', 'admin-1', 'cat1', JUN.getTime())
  insertPost.run('dr', 'article', 'draft', 'Draft', 'dr', 'admin-1', 'cat1', null)
  insertPost.run('dp', 'page', 'draft', 'Draft Page', 'dp', 'admin-1', null, null)
  insertPost.run('about', 'page', 'published', 'About', 'about', 'admin-1', null, JUN.getTime())

  sqlite.exec(`
    INSERT INTO comments (id, post_id, nickname, content, status) VALUES
      ('c-pending-1', 'a', 'Reader One', 'Pending one', 'pending'),
      ('c-pending-2', 'b', 'Reader Two', 'Pending two', 'pending'),
      ('c-approved', 'a', 'Reader Three', 'Approved', 'approved');
  `)
}

function setup() {
  const { db, sqlite } = createSqliteTestDatabase()
  seed(sqlite)
  return { repository: createAdminReadRepository(db as never) }
}

describe('admin read repository', () => {
  it('counts published articles, drafts, categories, tags, and pending comments', async () => {
    const { repository } = setup()

    const counts = await repository.getContentCounts()

    expect(counts).toEqual({
      // Two published articles; the published page ('about') is excluded.
      publishedArticles: 2,
      // Both draft posts count regardless of type (article + page).
      drafts: 2,
      categories: 2,
      tags: 3,
      pendingComments: 2
    })
  })

  it('returns zeroes for an empty database', async () => {
    const { db } = createSqliteTestDatabase()
    const repository = createAdminReadRepository(db as never)

    await expect(repository.getContentCounts()).resolves.toEqual({
      publishedArticles: 0,
      drafts: 0,
      categories: 0,
      tags: 0,
      pendingComments: 0
    })
  })
})
