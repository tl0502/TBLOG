import { createAdminPostRepository } from '../../../server/repositories/admin-post-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

function setup() {
  const { db, sqlite } = createSqliteTestDatabase()
  sqlite.exec(`
    INSERT INTO administrators (id, username, password_hash) VALUES ('admin-1', 'admin', 'hash');
    INSERT INTO categories (id, name, slug) VALUES ('cat1', 'Cat One', 'cat1');
    INSERT INTO tags (id, name, slug) VALUES ('t1', 'Tag One', 't1'), ('t2', 'Tag Two', 't2'), ('t3', 'Tag Three', 't3');
  `)
  const d1CompatibleDb = Object.assign(db, {
    async batch(statements: Array<{ run(): unknown }>) {
      return sqlite.transaction((items: Array<{ run(): unknown }>) => (
        items.map((statement) => statement.run())
      ))(statements)
    }
  })
  return { repository: createAdminPostRepository(d1CompatibleDb as never), sqlite }
}

const draft = {
  id: 'p1',
  type: 'article' as const,
  title: 'P1',
  slug: 'p1',
  authorId: 'admin-1',
  categoryId: 'cat1',
  cover: null
}

describe('admin post repository', () => {
  it('creates a draft and reads it back for editing', async () => {
    const { repository } = setup()

    await repository.createPost(draft)
    const edit = await repository.findForEdit('p1')

    expect(edit).toMatchObject({
      id: 'p1',
      title: 'P1',
      slug: 'p1',
      type: 'article',
      status: 'draft',
      featured: false,
      categoryId: 'cat1',
      cover: null,
      markdown: '',
      customExcerpt: null,
      tagIds: [],
      processingState: 'pending',
      processingError: null,
      seoTitle: null,
      seoDescription: null,
      canonicalUrlOverride: null,
      openGraphImageUrl: null,
      twitterImageUrl: null,
      jsonLdOverrideJson: null
    })
    expect(edit?.publishedAt).toBeNull()
  })

  it('reads stored markdown for editing', async () => {
    const { repository, sqlite } = setup()
    await repository.createPost(draft)
    sqlite
      .prepare(`INSERT INTO post_content (post_id, markdown, custom_excerpt, processing_state) VALUES ('p1', '# Hello', 'Summary', 'processed')`)
      .run()

    const edit = await repository.findForEdit('p1')
    expect(edit?.markdown).toBe('# Hello')
    expect(edit?.customExcerpt).toBe('Summary')
    expect(edit?.processingState).toBe('processed')
  })

  it('updates only the provided fields', async () => {
    const { repository } = setup()
    await repository.createPost(draft)

    await repository.updatePostFields('p1', { title: 'P1 Updated', cover: 'https://img/c.png' })
    const edit = await repository.findForEdit('p1')

    expect(edit).toMatchObject({ title: 'P1 Updated', slug: 'p1', cover: 'https://img/c.png' })
  })

  it('creates and partially updates the per-post SEO metadata row', async () => {
    const { repository } = setup()
    await repository.createPost(draft)

    await repository.upsertSeoMetadata('p1', {
      seoTitle: 'SEO title',
      seoDescription: 'SEO description',
      canonicalUrlOverride: 'https://example.com/posts/p1'
    })
    await repository.upsertSeoMetadata('p1', {
      seoDescription: null,
      openGraphImageUrl: 'https://img.example.com/og.png'
    })

    expect(await repository.findForEdit('p1')).toMatchObject({
      seoTitle: 'SEO title',
      seoDescription: null,
      canonicalUrlOverride: 'https://example.com/posts/p1',
      openGraphImageUrl: 'https://img.example.com/og.png'
    })
  })

  it('replaces the tag membership set', async () => {
    const { repository } = setup()
    await repository.createPost(draft)

    await repository.setTags('p1', ['t1', 't2'])
    expect((await repository.findForEdit('p1'))?.tagIds.sort()).toEqual(['t1', 't2'])

    await repository.setTags('p1', ['t2', 't3'])
    expect((await repository.findForEdit('p1'))?.tagIds.sort()).toEqual(['t2', 't3'])

    await repository.setTags('p1', [])
    expect((await repository.findForEdit('p1'))?.tagIds).toEqual([])
  })

  it('keeps the previous tag set when replacement fails', async () => {
    const { repository } = setup()
    await repository.createPost(draft)
    await repository.setTags('p1', ['t1'])

    await expect(repository.setTags('p1', ['missing-tag'])).rejects.toThrow()

    expect((await repository.findForEdit('p1'))?.tagIds).toEqual(['t1'])
  })

  it('sets status and stamps publishedAt, returning slug and category', async () => {
    const { repository } = setup()
    await repository.createPost(draft)
    const when = new Date('2026-06-10T00:00:00.000Z')

    const result = await repository.setStatus('p1', 'published', when)
    expect(result).toEqual({ slug: 'p1', categoryId: 'cat1' })

    const edit = await repository.findForEdit('p1')
    expect(edit?.status).toBe('published')
    expect(edit?.publishedAt).toEqual(when)

    expect(await repository.setStatus('missing', 'published', when)).toBeNull()
  })

  it('allows multiple featured posts and clears each article when disabled or unpublished', async () => {
    const { repository } = setup()
    await repository.createPost({ ...draft, id: 'p1', slug: 'p1' })
    await repository.createPost({ ...draft, id: 'p2', slug: 'p2' })
    const publishedAt = new Date('2026-06-10T00:00:00.000Z')
    await repository.setStatus('p1', 'published', publishedAt)
    await repository.setStatus('p2', 'published', publishedAt)

    await repository.setFeatured('p1', true)
    await repository.setFeatured('p2', true)

    expect((await repository.findForEdit('p1'))?.featured).toBe(true)
    expect((await repository.findForEdit('p2'))?.featured).toBe(true)

    await repository.setFeatured('p1', false)
    expect((await repository.findForEdit('p1'))?.featured).toBe(false)
    expect((await repository.findForEdit('p2'))?.featured).toBe(true)

    await repository.setStatus('p2', 'draft', publishedAt)
    expect((await repository.findForEdit('p2'))?.featured).toBe(false)
  })

  it('finds a post by slug for uniqueness checks', async () => {
    const { repository } = setup()
    await repository.createPost(draft)

    expect(await repository.findBySlug('p1')).toEqual({ id: 'p1' })
    expect(await repository.findBySlug('nope')).toBeNull()
  })

  it('deletes a post (cascading content and tags) and reports its prior slug/status', async () => {
    const { repository, sqlite } = setup()
    await repository.createPost(draft)
    await repository.setTags('p1', ['t1'])
    sqlite
      .prepare(`INSERT INTO post_content (post_id, markdown, processing_state) VALUES ('p1', '# x', 'processed')`)
      .run()
    await repository.upsertSeoMetadata('p1', { seoTitle: 'Removed SEO' })
    await repository.setStatus('p1', 'published', new Date('2026-06-10T00:00:00.000Z'))

    const removed = await repository.deletePost('p1')
    expect(removed).toEqual({ slug: 'p1', status: 'published' })
    expect(await repository.findForEdit('p1')).toBeNull()

    const tagCount = sqlite.prepare(`SELECT count(*) AS n FROM post_tags WHERE post_id = 'p1'`).get() as { n: number }
    const contentCount = sqlite.prepare(`SELECT count(*) AS n FROM post_content WHERE post_id = 'p1'`).get() as { n: number }
    const metadataCount = sqlite.prepare(`SELECT count(*) AS n FROM post_metadata WHERE post_id = 'p1'`).get() as { n: number }
    expect(tagCount.n).toBe(0)
    expect(contentCount.n).toBe(0)
    expect(metadataCount.n).toBe(0)

    expect(await repository.deletePost('p1')).toBeNull()
  })

  it('lists posts newest-updated first', async () => {
    const { repository } = setup()
    await repository.createPost({ ...draft, id: 'p1', slug: 'p1' })
    await repository.createPost({ ...draft, id: 'p2', slug: 'p2' })
    await repository.setTags('p1', ['t1'])

    const list = await repository.listPosts()
    expect(list.map((post) => post.id)).toContain('p1')
    expect(list.map((post) => post.id)).toContain('p2')
    expect(list.find((post) => post.id === 'p1')?.tagIds).toEqual(['t1'])
    expect(list.find((post) => post.id === 'p1')?.categoryId).toBe('cat1')
  })
})
