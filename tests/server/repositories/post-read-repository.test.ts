import { createPostReadRepository } from '../../../server/repositories/post-read-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

const JUN = new Date('2026-06-01T00:00:00.000Z')
const MAY = new Date('2026-05-02T00:00:00.000Z')
const APR = new Date('2026-04-01T00:00:00.000Z')
const MAR = new Date('2026-03-01T00:00:00.000Z')

const CODE_META_JSON =
  '[{"index":0,"language":"ts","filename":null,"highlightedLines":[],"collapsed":false,"diff":false}]'

function seed(sqlite: ReturnType<typeof createSqliteTestDatabase>['sqlite']) {
  sqlite.exec(`
    INSERT INTO administrators (id, username, password_hash) VALUES ('admin-1', 'admin', 'hash');
    INSERT INTO categories (id, name, slug) VALUES ('cat1', 'Cat One', 'cat1'), ('cat2', 'Cat Two', 'cat2');
    INSERT INTO tags (id, name, slug) VALUES ('t1', 'Tag One', 't1'), ('t2', 'Tag Two', 't2');
  `)

  const insertPost = sqlite.prepare(
    `INSERT INTO posts (id, type, status, title, slug, author_id, category_id, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  insertPost.run('a', 'article', 'published', 'A', 'a', 'admin-1', 'cat1', JUN.getTime())
  insertPost.run('b', 'article', 'published', 'B', 'b', 'admin-1', 'cat1', MAY.getTime())
  insertPost.run('c', 'article', 'published', 'C', 'c', 'admin-1', 'cat2', APR.getTime())
  insertPost.run('dr', 'article', 'draft', 'Draft', 'dr', 'admin-1', 'cat1', null)
  insertPost.run('about', 'page', 'published', 'About', 'about', 'admin-1', null, MAR.getTime())

  sqlite.exec(`
    UPDATE posts SET updated_at = ${Date.parse('2026-06-02T00:00:00.000Z')} WHERE id = 'a';
    UPDATE posts SET updated_at = ${Date.parse('2026-06-12T00:00:00.000Z')} WHERE id = 'b';
    UPDATE posts SET updated_at = ${Date.parse('2026-06-22T00:00:00.000Z')} WHERE id = 'c';
  `)

  const insertContent = sqlite.prepare(
    `INSERT INTO post_content (post_id, markdown, html, excerpt, reading_time, processing_state)
     VALUES (?, ?, ?, ?, ?, 'processed')`
  )
  insertContent.run('a', '# A', '<h1>A</h1>', 'Excerpt A', 3)
  insertContent.run('b', '# B', '<h1>B</h1>', 'Excerpt B', 2)
  insertContent.run('c', '# C', '<h1>C</h1>', 'Excerpt C', 1)
  insertContent.run('about', '# About', '<h1>About</h1>', 'About excerpt', 1)

  // Post 'a' carries stored code-block metadata so the detail read proves raw pass-through.
  sqlite.prepare(`UPDATE post_content SET code_meta_json = ? WHERE post_id = 'a'`).run(CODE_META_JSON)

  // Post 'a' also carries a cover and a full post_metadata row so detail reads project SEO fields.
  sqlite.prepare(`UPDATE posts SET cover = ? WHERE id = 'a'`).run('https://cdn.example/cover.png')
  sqlite.exec(`
    INSERT INTO post_metadata
      (post_id, seo_title, seo_description, canonical_url_override, open_graph_image_url, twitter_image_url, json_ld_override_json)
    VALUES
      ('a', 'SEO A', 'SEO desc A', 'https://canonical.example/a', 'https://og.example/a.png', 'https://tw.example/a.png', '{"@type":"Article"}');
  `)

  const insertTag = sqlite.prepare(`INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)`)
  insertTag.run('a', 't1')
  insertTag.run('c', 't1')
}

function setup() {
  const { db, sqlite } = createSqliteTestDatabase()
  seed(sqlite)
  return { repository: createPostReadRepository(db as never), sqlite }
}

describe('post read repository', () => {
  it('sorts and paginates the home feed by published time', async () => {
    const { repository } = setup()

    await expect(repository.listHomeArticles({ page: 1, limit: 2, sort: 'publishedAt', order: 'desc' })).resolves.toMatchObject({
      items: [expect.objectContaining({ slug: 'a' }), expect.objectContaining({ slug: 'b' })],
      page: 1,
      pageSize: 2,
      total: 3,
      pageCount: 2,
      sort: 'publishedAt',
      order: 'desc'
    })
    const ascending = await repository.listHomeArticles({ page: 1, limit: 3, sort: 'publishedAt', order: 'asc' })
    expect(ascending.items.map((item) => item.slug)).toEqual(['c', 'b', 'a'])
  })

  it('sorts the home feed by updated time', async () => {
    const { repository } = setup()

    const descending = await repository.listHomeArticles({ page: 1, limit: 3, sort: 'updatedAt', order: 'desc' })
    const ascending = await repository.listHomeArticles({ page: 1, limit: 3, sort: 'updatedAt', order: 'asc' })

    expect(descending.items.map((item) => item.slug)).toEqual(['c', 'b', 'a'])
    expect(ascending.items.map((item) => item.slug)).toEqual(['a', 'b', 'c'])
  })

  it('clamps an out-of-range home page before applying the offset', async () => {
    const { repository } = setup()

    const page = await repository.listHomeArticles({ page: 99, limit: 2, sort: 'publishedAt', order: 'desc' })

    expect(page.items.map((item) => item.slug)).toEqual(['c'])
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 3, pageCount: 2 })
  })

  it('uses documented stable tie breakers for published and updated ordering', async () => {
    const { repository, sqlite } = setup()
    sqlite.prepare(`UPDATE posts SET published_at = ?, updated_at = ? WHERE id = 'b'`)
      .run(JUN.getTime(), Date.parse('2026-06-12T00:00:00.000Z'))

    const published = await repository.listHomeArticles({ page: 1, limit: 3, sort: 'publishedAt', order: 'desc' })
    expect(published.items.map((item) => item.slug)).toEqual(['b', 'a', 'c'])

    sqlite.prepare(`UPDATE posts SET published_at = ?, updated_at = ? WHERE id = 'b'`)
      .run(MAY.getTime(), Date.parse('2026-06-12T00:00:00.000Z'))
    sqlite.prepare(`UPDATE posts SET updated_at = ? WHERE id = 'a'`)
      .run(Date.parse('2026-06-12T00:00:00.000Z'))
    const updated = await repository.listHomeArticles({ page: 1, limit: 3, sort: 'updatedAt', order: 'desc' })
    expect(updated.items.map((item) => item.slug)).toEqual(['c', 'a', 'b'])
  })

  it('lists only published articles, newest first, with public projections', async () => {
    const { repository } = setup()

    const page = await repository.listPublishedArticles({ limit: 20 })

    expect(page.items.map((item) => item.slug)).toEqual(['a', 'b', 'c'])
    expect(page.nextCursor).toBeNull()
    expect(page.items[0]).toEqual({
      id: 'a',
      slug: 'a',
      title: 'A',
      cover: 'https://cdn.example/cover.png',
      excerpt: 'Excerpt A',
      readingTime: 3,
      publishedAt: JUN,
      category: { slug: 'cat1', name: 'Cat One' },
      tags: [{ slug: 't1', name: 'Tag One' }]
    })
  })

  it('bulk resolves only published articles and preserves unique requested slug order', async () => {
    const { repository } = setup()

    const articles = await repository.listPublishedArticlesBySlugs([
      'c', 'about', 'dr', 'missing', 'a', 'c'
    ])

    expect(articles.map((item) => item.slug)).toEqual(['c', 'a'])
    expect(articles[1]).toEqual(expect.objectContaining({
      slug: 'a',
      excerpt: 'Excerpt A',
      category: { slug: 'cat1', name: 'Cat One' },
      tags: [{ slug: 't1', name: 'Tag One' }]
    }))
  })

  it('bulk resolves published article ids and lists report synchronization references', async () => {
    const { repository } = setup()

    expect((await repository.listPublishedArticlesByIds(['c', 'about', 'dr', 'a', 'c'])).map((item) => item.id))
      .toEqual(['c', 'a'])
    await expect(repository.listAllPublishedAnalyticsArticles()).resolves.toEqual([
      { id: 'a', slug: 'a', publishedAt: JUN },
      { id: 'b', slug: 'b', publishedAt: MAY },
      { id: 'c', slug: 'c', publishedAt: APR }
    ])
    await expect(repository.listPublishedArticleIds()).resolves.toEqual(expect.arrayContaining(['a', 'b', 'c']))
  })

  it('batches large public article hydration below the D1 parameter limit', async () => {
    const { repository, sqlite } = setup()
    const insertPost = sqlite.prepare(
      `INSERT INTO posts (id, type, status, title, slug, author_id, category_id, published_at)
       VALUES (?, 'article', 'published', ?, ?, 'admin-1', 'cat1', ?)`
    )
    const ids = Array.from({ length: 161 }, (_, index) => `bulk-${index}`)
    for (const [index, id] of ids.entries()) {
      insertPost.run(id, `Bulk ${index}`, id, JUN.getTime() + index)
    }

    const articles = await repository.listPublishedArticlesByIds([...ids].reverse())

    expect(articles).toHaveLength(161)
    expect(articles.map((article) => article.id)).toEqual([...ids].reverse())
    const bySlug = await repository.listPublishedArticlesBySlugs([...ids].reverse())
    expect(bySlug).toHaveLength(161)
    expect(bySlug.map((article) => article.slug)).toEqual([...ids].reverse())
  })

  it('returns only the published article selected for the homepage', async () => {
    const { repository, sqlite } = setup()
    sqlite.prepare(`UPDATE posts SET is_featured = 1 WHERE id = 'b'`).run()

    await expect(repository.findFeaturedPublishedArticles()).resolves.toEqual([expect.objectContaining({
      id: 'b',
      slug: 'b',
      title: 'B'
    })])

    sqlite.prepare(`UPDATE posts SET is_featured = 0 WHERE id = 'b'`).run()
    sqlite.prepare(`UPDATE posts SET is_featured = 1 WHERE id = 'dr'`).run()
    await expect(repository.findFeaturedPublishedArticles()).resolves.toEqual([])
  })

  it('returns published article and page detail, but not drafts or unknown slugs', async () => {
    const { repository } = setup()

    await expect(repository.findPublishedDetailBySlug('a')).resolves.toEqual({
      id: 'a',
      slug: 'a',
      title: 'A',
      excerpt: 'Excerpt A',
      readingTime: 3,
      publishedAt: JUN,
      updatedAt: new Date('2026-06-02T00:00:00.000Z'),
      category: { slug: 'cat1', name: 'Cat One' },
      tags: [{ slug: 't1', name: 'Tag One' }],
      type: 'article',
      html: '<h1>A</h1>',
      tocJson: null,
      codeMetaJson: CODE_META_JSON,
      cover: 'https://cdn.example/cover.png',
      seoTitle: 'SEO A',
      seoDescription: 'SEO desc A',
      canonicalUrlOverride: 'https://canonical.example/a',
      openGraphImageUrl: 'https://og.example/a.png',
      twitterImageUrl: 'https://tw.example/a.png',
      jsonLdOverrideJson: '{"@type":"Article"}'
    })

    // A published post without a metadata row returns null SEO fields (with a null cover).
    await expect(repository.findPublishedDetailBySlug('about')).resolves.toMatchObject({
      slug: 'about',
      type: 'page',
      html: '<h1>About</h1>',
      category: null,
      tags: [],
      cover: null,
      updatedAt: expect.any(Date),
      seoTitle: null,
      seoDescription: null,
      canonicalUrlOverride: null,
      openGraphImageUrl: null,
      twitterImageUrl: null,
      jsonLdOverrideJson: null
    })

    await expect(repository.findPublishedDetailBySlug('dr')).resolves.toBeNull()
    await expect(repository.findPublishedDetailBySlug('missing')).resolves.toBeNull()
  })

  it('filters published articles by category slug', async () => {
    const { repository } = setup()

    const cat1 = await repository.listPublishedArticlesByCategorySlug('cat1', { limit: 20 })
    const cat2 = await repository.listPublishedArticlesByCategorySlug('cat2', { limit: 20 })
    const missing = await repository.listPublishedArticlesByCategorySlug('nope', { limit: 20 })

    expect(cat1.items.map((item) => item.slug)).toEqual(['a', 'b'])
    expect(cat2.items.map((item) => item.slug)).toEqual(['c'])
    expect(missing.items).toEqual([])
  })

  it('filters published articles by tag slug', async () => {
    const { repository } = setup()

    const t1 = await repository.listPublishedArticlesByTagSlug('t1', { limit: 20 })
    const t2 = await repository.listPublishedArticlesByTagSlug('t2', { limit: 20 })

    expect(t1.items.map((item) => item.slug)).toEqual(['a', 'c'])
    expect(t2.items).toEqual([])
  })

  it('groups the archive by year and month, newest first, excluding pages', async () => {
    const { repository } = setup()

    const archive = await repository.listArchive()

    expect(archive.map((group) => [group.year, group.month, group.items.map((item) => item.slug)])).toEqual([
      [2026, 6, ['a']],
      [2026, 5, ['b']],
      [2026, 4, ['c']]
    ])
  })

  it('paginates with a stable cursor and no skips or duplicates', async () => {
    const { repository } = setup()

    const page1 = await repository.listPublishedArticles({ limit: 2 })
    expect(page1.items.map((item) => item.slug)).toEqual(['a', 'b'])
    expect(page1.nextCursor).toBeTruthy()

    const page2 = await repository.listPublishedArticles({ limit: 2, cursor: page1.nextCursor! })
    expect(page2.items.map((item) => item.slug)).toEqual(['c'])
    expect(page2.nextCursor).toBeNull()
  })

  it('lists scoped feed posts with SQL limits and SEO metadata for RSS', async () => {
    const { repository } = setup()

    const sitemap = await repository.listFeedPosts({ scope: 'sitemap' })
    expect(sitemap.map((post) => [post.slug, post.type])).toEqual([
      ['a', 'article'],
      ['b', 'article'],
      ['c', 'article'],
      ['about', 'page']
    ])
    expect(sitemap.map((post) => post.slug)).not.toContain('dr')

    const limitedArticles = await repository.listFeedPosts({ scope: 'articles', limit: 2 })
    expect(limitedArticles.map((post) => post.slug)).toEqual(['a', 'b'])
    expect(limitedArticles.every((post) => post.type === 'article')).toBe(true)

    const first = limitedArticles[0]
    expect(first).toMatchObject({
      slug: 'a',
      title: 'A',
      excerpt: 'Excerpt A',
      seoTitle: 'SEO A',
      seoDescription: 'SEO desc A',
      type: 'article',
      publishedAt: JUN
    })
    expect(first.updatedAt).toBeInstanceOf(Date)

    // Articles without a metadata row still return null SEO fields.
    expect(limitedArticles[1]).toMatchObject({
      slug: 'b',
      seoTitle: null,
      seoDescription: null
    })
  })
})
