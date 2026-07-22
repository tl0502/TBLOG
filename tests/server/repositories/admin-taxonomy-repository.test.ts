import { createAdminTaxonomyRepository } from '../../../server/repositories/admin-taxonomy-repository'
import { UNCATEGORIZED_CATEGORY_ID } from '../../../server/domain/taxonomy'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

function setup() {
  const { db, sqlite } = createSqliteTestDatabase()
  sqlite.exec(`
    INSERT INTO administrators (id, username, password_hash) VALUES ('admin-1', 'admin', 'hash');
    INSERT INTO categories (id, name, slug, sort_order) VALUES
      ('cat2', 'Notes', 'notes', 2),
      ('cat1', 'Engineering', 'engineering', 1);
    INSERT INTO tags (id, name, slug, sort_order) VALUES
      ('tag2', 'Cloudflare', 'cloudflare', 2),
      ('tag1', 'Nuxt', 'nuxt', 1);
  `)
  // Emulate D1's atomic db.batch() with a better-sqlite3 transaction.
  const d1CompatibleDb = Object.assign(db, {
    async batch(statements: Array<{ run(): unknown }>) {
      return sqlite.transaction((items: Array<{ run(): unknown }>) => (
        items.map((statement) => statement.run())
      ))(statements)
    }
  })
  return { repository: createAdminTaxonomyRepository(d1CompatibleDb as never), sqlite }
}

function seedArticle(
  sqlite: ReturnType<typeof createSqliteTestDatabase>['sqlite'],
  id: string,
  categoryId: string,
  status: 'draft' | 'published' = 'published'
) {
  sqlite
    .prepare(
      `INSERT INTO posts (id, type, status, title, slug, author_id, category_id)
       VALUES (?, 'article', ?, ?, ?, 'admin-1', ?)`
    )
    .run(id, status, id, id, categoryId)
}

function tagArticle(
  sqlite: ReturnType<typeof createSqliteTestDatabase>['sqlite'],
  postId: string,
  tagId: string
) {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO posts (id, type, status, title, slug, author_id, category_id)
       VALUES (?, 'article', 'published', ?, ?, 'admin-1', 'cat1')`
    )
    .run(postId, postId, postId)
  sqlite.prepare(`INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)`).run(postId, tagId)
}

describe('admin taxonomy repository', () => {
  it('lists category and tag options as stable id/name editor values', async () => {
    const { repository } = setup()

    const categories = await repository.listCategoryOptions()
    const tags = await repository.listTagOptions()

    expect(categories).toEqual([
      // Seeded 未分类 sorts first (sort_order 0).
      { id: UNCATEGORIZED_CATEGORY_ID, name: '未分类' },
      { id: 'cat1', name: 'Engineering' },
      { id: 'cat2', name: 'Notes' }
    ])
    expect(tags).toEqual([
      { id: 'tag1', name: 'Nuxt' },
      { id: 'tag2', name: 'Cloudflare' }
    ])
    expect(Object.keys(categories[0]).sort()).toEqual(['id', 'name'])
    expect(Object.keys(tags[0]).sort()).toEqual(['id', 'name'])
  })

  it('lists categories with article usage counts (drafts included)', async () => {
    const { repository, sqlite } = setup()
    seedArticle(sqlite, 'a', 'cat1', 'published')
    seedArticle(sqlite, 'b', 'cat1', 'draft')
    seedArticle(sqlite, 'c', 'cat2', 'published')

    const categories = await repository.listCategoriesWithCounts()
    const bySlug = Object.fromEntries(categories.map((category) => [category.slug, category.articleCount]))

    expect(bySlug).toMatchObject({ uncategorized: 0, engineering: 2, notes: 1 })
    expect(categories.find((category) => category.id === UNCATEGORIZED_CATEGORY_ID)).toMatchObject({
      slug: 'uncategorized',
      isSystem: true
    })
  })

  it('creates a category and reads it back with a zero count', async () => {
    const { repository } = setup()

    await repository.createCategory({
      id: 'new1',
      name: 'Design',
      slug: 'design',
      description: 'UI work',
      color: '#abcdef',
      sortOrder: 5
    })

    expect(await repository.findCategoryById('new1')).toMatchObject({
      id: 'new1',
      name: 'Design',
      slug: 'design',
      description: 'UI work',
      color: '#abcdef',
      sortOrder: 5,
      isSystem: false,
      articleCount: 0
    })
  })

  it('updates only the provided category fields', async () => {
    const { repository } = setup()

    await repository.updateCategory('cat1', { name: 'Eng', color: '#fff' })

    expect(await repository.findCategoryById('cat1')).toMatchObject({
      id: 'cat1',
      name: 'Eng',
      slug: 'engineering',
      color: '#fff'
    })
  })

  it('finds a category id by slug for uniqueness checks', async () => {
    const { repository } = setup()

    expect(await repository.findCategoryBySlug('engineering')).toEqual({ id: 'cat1' })
    expect(await repository.findCategoryBySlug('nope')).toBeNull()
  })

  it('lists only published article slugs affected by a category mutation', async () => {
    const { repository, sqlite } = setup()
    seedArticle(sqlite, 'published-article', 'cat1', 'published')
    seedArticle(sqlite, 'draft-article', 'cat1', 'draft')
    sqlite.prepare(
      `INSERT INTO posts (id, type, status, title, slug, author_id, category_id)
       VALUES ('published-page', 'page', 'published', 'Page', 'published-page', 'admin-1', 'cat1')`
    ).run()

    await expect(repository.listPublishedPostSlugsByCategoryId('cat1')).resolves.toEqual([
      'published-article'
    ])
  })

  it('reassigns posts to the fallback category, then deletes the category', async () => {
    const { repository, sqlite } = setup()
    seedArticle(sqlite, 'a', 'cat1', 'published')
    seedArticle(sqlite, 'b', 'cat1', 'draft')

    await repository.deleteCategoryReassigning('cat1', UNCATEGORIZED_CATEGORY_ID)

    expect(await repository.findCategoryById('cat1')).toBeNull()
    const rows = sqlite
      .prepare(`SELECT category_id AS categoryId FROM posts WHERE id IN ('a', 'b')`)
      .all() as Array<{ categoryId: string }>
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.categoryId === UNCATEGORIZED_CATEGORY_ID)).toBe(true)
  })

  it('lists tags with article usage counts (drafts included)', async () => {
    const { repository, sqlite } = setup()
    tagArticle(sqlite, 'p1', 'tag1')
    tagArticle(sqlite, 'p2', 'tag1')
    tagArticle(sqlite, 'p3', 'tag2')

    const tags = await repository.listTagsWithCounts()
    const bySlug = Object.fromEntries(tags.map((tag) => [tag.slug, tag.articleCount]))

    expect(bySlug).toMatchObject({ nuxt: 2, cloudflare: 1 })
  })

  it('creates, finds, and updates a tag', async () => {
    const { repository } = setup()

    await repository.createTag({
      id: 'new1',
      name: 'Edge',
      slug: 'edge',
      description: null,
      color: null,
      sortOrder: 3
    })
    expect(await repository.findTagById('new1')).toMatchObject({
      id: 'new1',
      slug: 'edge',
      sortOrder: 3,
      articleCount: 0
    })
    expect(await repository.findTagBySlug('edge')).toEqual({ id: 'new1' })

    await repository.updateTag('new1', { name: 'Edge Runtime' })
    expect(await repository.findTagById('new1')).toMatchObject({ name: 'Edge Runtime', slug: 'edge' })
  })

  it('deletes a tag and cascades its post relations', async () => {
    const { repository, sqlite } = setup()
    tagArticle(sqlite, 'p1', 'tag1')

    await repository.deleteTag('tag1')

    expect(await repository.findTagBySlug('nuxt')).toBeNull()
    const remaining = sqlite
      .prepare(`SELECT count(*) AS n FROM post_tags WHERE tag_id = 'tag1'`)
      .get() as { n: number }
    expect(remaining.n).toBe(0)
  })

  it('lists distinct published article slugs affected by tag mutations', async () => {
    const { repository, sqlite } = setup()
    tagArticle(sqlite, 'shared', 'tag1')
    tagArticle(sqlite, 'shared', 'tag2')
    tagArticle(sqlite, 'source-only', 'tag1')
    seedArticle(sqlite, 'draft-tagged', 'cat1', 'draft')
    sqlite.prepare(`INSERT INTO post_tags (post_id, tag_id) VALUES ('draft-tagged', 'tag1')`).run()

    const slugs = await repository.listPublishedPostSlugsByTagIds(['tag1', 'tag2'])

    expect(slugs.sort()).toEqual(['shared', 'source-only'])
  })

  it('merges a tag: repoints relations, dedupes, and deletes the source', async () => {
    const { repository, sqlite } = setup()
    tagArticle(sqlite, 'p1', 'tag1') // source only
    tagArticle(sqlite, 'p2', 'tag1') // source + target
    tagArticle(sqlite, 'p2', 'tag2')
    tagArticle(sqlite, 'p3', 'tag2') // target only

    await repository.mergeTags('tag1', 'tag2')

    expect(await repository.findTagBySlug('nuxt')).toBeNull()
    const rels = sqlite
      .prepare(`SELECT post_id AS postId, tag_id AS tagId FROM post_tags ORDER BY post_id`)
      .all() as Array<{ postId: string; tagId: string }>
    expect(rels).toEqual([
      { postId: 'p1', tagId: 'tag2' },
      { postId: 'p2', tagId: 'tag2' },
      { postId: 'p3', tagId: 'tag2' }
    ])
  })

  it('merges a large tag with one insert-select instead of per-post statements', async () => {
    const { repository, sqlite } = setup()
    const postIds = Array.from({ length: 120 }, (_, index) => `bulk-${index}`)
    for (const postId of postIds) tagArticle(sqlite, postId, 'tag1')

    await repository.mergeTags('tag1', 'tag2')

    expect(sqlite.prepare("select count(*) as count from post_tags where tag_id = 'tag2'").get())
      .toEqual({ count: 120 })
    expect(await repository.findTagBySlug('nuxt')).toBeNull()
  })
})
