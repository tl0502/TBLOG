import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { categories } from '../../../server/database/schema'
import {
  UNCATEGORIZED_CATEGORY_ID,
  UNCATEGORIZED_NAME,
  UNCATEGORIZED_SLUG
} from '../../../server/domain/taxonomy'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

function readMigration(fileName: string): string {
  return readFileSync(
    join(process.cwd(), 'server/database/migrations', fileName),
    'utf8'
  )
}

describe('uncategorized category seed migration', () => {
  it('seeds the 未分类 system category', async () => {
    const { db } = createSqliteTestDatabase()

    const row = await db.query.categories.findFirst({
      where: eq(categories.id, UNCATEGORIZED_CATEGORY_ID)
    })

    expect(row).toMatchObject({
      id: UNCATEGORIZED_CATEGORY_ID,
      slug: UNCATEGORIZED_SLUG,
      name: UNCATEGORIZED_NAME,
      isSystem: true,
      sortOrder: 0
    })
  })

  it('is the only system category', async () => {
    const { db } = createSqliteTestDatabase()

    const systemCategories = await db.query.categories.findMany({
      where: eq(categories.isSystem, true)
    })

    expect(systemCategories).toHaveLength(1)
    expect(systemCategories[0]?.id).toBe(UNCATEGORIZED_CATEGORY_ID)
  })

  it('backfills existing posts that had no category before Phase 10', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    sqlite.exec(readMigration('0000_known_post.sql'))
    sqlite.exec(readMigration('0001_hard_black_cat.sql'))

    sqlite.prepare(`
      INSERT INTO administrators (id, username, password_hash)
      VALUES ('admin-1', 'admin', 'hash')
    `).run()
    sqlite.prepare(`
      INSERT INTO posts (id, type, title, slug, author_id, category_id)
      VALUES
        ('post-article', 'article', 'Article', 'article', 'admin-1', NULL),
        ('post-page', 'page', 'Page', 'page', 'admin-1', NULL)
    `).run()

    sqlite.exec(readMigration('0002_seed_uncategorized.sql'))
    sqlite.exec(readMigration('0003_backfill_uncategorized_posts.sql'))

    const rows = sqlite.prepare(`
      SELECT id, category_id AS categoryId
      FROM posts
      ORDER BY id
    `).all() as Array<{ id: string; categoryId: string | null }>

    expect(rows).toEqual([
      { id: 'post-article', categoryId: UNCATEGORIZED_CATEGORY_ID },
      { id: 'post-page', categoryId: UNCATEGORIZED_CATEGORY_ID }
    ])
  })
})
