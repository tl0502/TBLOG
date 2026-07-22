import { createTaxonomyReadRepository } from '../../../server/repositories/taxonomy-read-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

function seed(sqlite: ReturnType<typeof createSqliteTestDatabase>['sqlite']) {
  sqlite.exec(`
    INSERT INTO administrators (id, username, password_hash) VALUES ('admin-1', 'admin', 'hash');
    INSERT INTO categories (id, name, slug, sort_order) VALUES
      ('cat1', 'Cat One', 'cat1', 0), ('cat2', 'Cat Two', 'cat2', 1), ('cat3', 'Cat Three', 'cat3', 2);
    INSERT INTO tags (id, name, slug, sort_order) VALUES ('t1', 'Tag One', 't1', 0), ('t2', 'Tag Two', 't2', 1);
  `)

  const insertPost = sqlite.prepare(
    `INSERT INTO posts (id, type, status, title, slug, author_id, category_id, published_at)
     VALUES (?, ?, ?, ?, ?, 'admin-1', ?, ?)`
  )
  insertPost.run('a', 'article', 'published', 'A', 'a', 'cat1', 1000)
  insertPost.run('b', 'article', 'published', 'B', 'b', 'cat1', 2000)
  insertPost.run('c', 'article', 'published', 'C', 'c', 'cat2', 3000)
  insertPost.run('draft', 'article', 'draft', 'Draft', 'draft', 'cat1', null)
  insertPost.run('page', 'page', 'published', 'Page', 'page', 'cat1', 4000)

  const insertTag = sqlite.prepare(`INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)`)
  insertTag.run('a', 't1')
  insertTag.run('c', 't1')
  insertTag.run('draft', 't1')
}

function setup() {
  const { db, sqlite } = createSqliteTestDatabase()
  seed(sqlite)
  return { repository: createTaxonomyReadRepository(db as never) }
}

describe('taxonomy read repository', () => {
  it('lists categories ordered by sortOrder with published-article counts', async () => {
    const { repository } = setup()

    const categories = await repository.listCategoriesWithCounts()

    expect(categories.map((category) => [category.slug, category.articleCount])).toEqual([
      ['cat1', 2],
      // Seeded 未分类 (sort_order 0) sorts after 'Cat One' under BINARY name collation.
      ['uncategorized', 0],
      ['cat2', 1],
      ['cat3', 0]
    ])
    expect(categories[0]).toEqual({
      slug: 'cat1',
      name: 'Cat One',
      description: null,
      color: null,
      articleCount: 2
    })
  })

  it('lists tags ordered by sortOrder, counting only published articles', async () => {
    const { repository } = setup()

    const tags = await repository.listTagsWithCounts()

    expect(tags.map((tag) => [tag.slug, tag.articleCount])).toEqual([
      ['t1', 2],
      ['t2', 0]
    ])
  })

  it('finds category and tag by slug, returning null for unknown slugs', async () => {
    const { repository } = setup()

    await expect(repository.findCategoryBySlug('cat1')).resolves.toMatchObject({ slug: 'cat1', articleCount: 2 })
    await expect(repository.findCategoryBySlug('nope')).resolves.toBeNull()
    await expect(repository.findTagBySlug('t1')).resolves.toMatchObject({ slug: 't1', articleCount: 2 })
    await expect(repository.findTagBySlug('nope')).resolves.toBeNull()
  })
})
