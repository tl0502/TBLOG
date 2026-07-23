import { createAdminPostService } from '../../../server/services/admin-post-service'
import type {
  AdminPostEdit,
  AdminPostRepository
} from '../../../server/repositories/contracts/admin-write-repositories'
import type { CacheProvider } from '../../../server/providers/cache/cache-provider'
import type {
  SearchProvider,
  SearchRecord
} from '../../../server/providers/search/search-provider'
import type { SearchIndexReadRepository } from '../../../server/services/admin-post-service'
import { UNCATEGORIZED_CATEGORY_ID } from '../../../server/domain/taxonomy'
import { cacheKeys } from '../../../server/utils/cache-keys'

function editFixture(overrides: Partial<AdminPostEdit> = {}): AdminPostEdit {
  return {
    id: 'p1',
    title: 'P1',
    slug: 'p1',
    type: 'article',
    status: 'draft',
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    publishedAt: null,
    categoryId: 'cat1',
    cover: null,
    tagIds: [],
    markdown: '',
    customExcerpt: null,
    processingState: 'processed',
    processingError: null,
    seoTitle: null,
    seoDescription: null,
    canonicalUrlOverride: null,
    openGraphImageUrl: null,
    twitterImageUrl: null,
    jsonLdOverrideJson: null,
    ...overrides,
    featured: overrides.featured ?? false
  }
}

function createFakeRepo(seed: AdminPostEdit[] = [], operations: string[] = []) {
  const posts = new Map(seed.map((post) => [post.id, { ...post }]))
  const calls = {
    create: [] as unknown[],
    update: [] as unknown[],
    setStatus: [] as unknown[],
    setFeatured: [] as unknown[],
    setTags: [] as unknown[],
    metadata: [] as unknown[],
    delete: [] as string[]
  }
  const repository: AdminPostRepository = {
    async listPosts(query) {
      const all = [...posts.values()]
      return { items: all.slice(query.offset, query.offset + query.limit), total: all.length }
    },
    async findForEdit(id) {
      const post = posts.get(id)
      // Return a copy so later writes don't mutate the caller's snapshot (mirrors a real read).
      return post ? { ...post, tagIds: [...post.tagIds] } : null
    },
    async findBySlug(slug) {
      const found = [...posts.values()].find((post) => post.slug === slug)
      return found ? { id: found.id } : null
    },
    async createPost(input) {
      operations.push('post')
      calls.create.push(input)
      posts.set(input.id, editFixture({ ...input, status: 'draft', tagIds: [], markdown: '', publishedAt: null }))
    },
    async updatePostFields(id, fields) {
      operations.push('fields')
      calls.update.push({ id, fields })
      const post = posts.get(id)
      if (post) Object.assign(post, fields)
    },
    async upsertSeoMetadata(postId, fields) {
      operations.push('metadata')
      calls.metadata.push({ postId, fields })
      const post = posts.get(postId)
      if (post) Object.assign(post, fields)
    },
    async setStatus(id, status, publishedAt) {
      calls.setStatus.push({ id, status, publishedAt })
      const post = posts.get(id)
      if (!post) return null
      post.status = status
      post.publishedAt = publishedAt
      if (status === 'draft') post.featured = false
      return { slug: post.slug, categoryId: post.categoryId }
    },
    async setFeatured(id, featured) {
      calls.setFeatured.push({ id, featured })
      if (featured) {
        for (const post of posts.values()) post.featured = false
      }
      const post = posts.get(id)
      if (post) post.featured = featured
    },
    async setTags(postId, tagIds) {
      operations.push('tags')
      calls.setTags.push({ postId, tagIds })
      const post = posts.get(postId)
      if (post) post.tagIds = [...tagIds]
    },
    async deletePost(id) {
      calls.delete.push(id)
      const post = posts.get(id)
      if (!post) return null
      posts.delete(id)
      return { slug: post.slug, status: post.status }
    }
  }
  return { repository, posts, calls }
}

function createFakeContent(opts: { publishable?: boolean } = {}, operations: string[] = []) {
  const calls = { processAndStore: [] as unknown[], preview: [] as string[], assertPublishable: 0 }
  const service = {
    async processAndStore(input: { postId: string; markdown: string }) {
      operations.push('content')
      calls.processAndStore.push(input)
      return {} as never
    },
    async previewMarkdown(markdown: string) {
      calls.preview.push(markdown)
      return { html: `<p>${markdown}</p>` }
    },
    async assertPublishableProcessedOutput() {
      calls.assertPublishable += 1
      if (opts.publishable === false) {
        throw Object.assign(new Error('nope'), { code: 'processed_content_required', statusCode: 409 })
      }
    }
  }
  return { service: service as never, calls }
}

function createFakeCache() {
  const deleted: string[][] = []
  const deleteOptions: Array<{ forceGeneration?: boolean } | undefined> = []
  const cache: CacheProvider = {
    async get() {
      return null
    },
    async set() {},
    async delete(keys, options) {
      deleted.push(keys)
      deleteOptions.push(options)
    }
  }
  return { cache, deleted, deleteOptions }
}

function recordFixture(overrides: Partial<SearchRecord> = {}): SearchRecord {
  return {
    objectID: 'p1',
    title: 'P1',
    slug: 'p1',
    excerpt: null,
    body: 'body',
    category: null,
    tags: [],
    publishedAt: 0,
    ...overrides
  }
}

function createFakeSearch(opts: { fail?: boolean; record?: SearchRecord | null } = {}) {
  const calls = { index: [] as SearchRecord[], remove: [] as string[] }
  const searchProvider: SearchProvider = {
    async indexRecord(record) {
      if (opts.fail) throw new Error('index boom')
      calls.index.push(record)
    },
    async removeRecord(objectID) {
      if (opts.fail) throw new Error('remove boom')
      calls.remove.push(objectID)
    },
    async replaceAllRecords() {}
  }
  const searchRecordSource: SearchIndexReadRepository = {
    async getSearchRecord(postId) {
      if (opts.record === null) return null
      return opts.record ?? recordFixture({ objectID: postId })
    }
  }
  return { searchProvider, searchRecordSource, calls }
}

function createFakeSearchReporter() {
  const calls = {
    successes: [] as Array<{ postId: string; operation: 'upsert' | 'remove' }>,
    failures: [] as Array<{ postId: string; operation: 'upsert' | 'remove' }>
  }
  return {
    reporter: {
      async reportSuccess(input: { postId: string; operation: 'upsert' | 'remove' }) {
        calls.successes.push(input)
      },
      async reportFailure(input: { postId: string; operation: 'upsert' | 'remove' }) {
        calls.failures.push(input)
      }
    },
    calls
  }
}

function build(
  seed: AdminPostEdit[] = [],
  contentOpts: { publishable?: boolean } = {},
  searchOpts: { fail?: boolean; record?: SearchRecord | null } = {}
) {
  const operations: string[] = []
  const repo = createFakeRepo(seed, operations)
  const content = createFakeContent(contentOpts, operations)
  const cacheParts = createFakeCache()
  const search = createFakeSearch(searchOpts)
  const searchStatus = createFakeSearchReporter()
  const service = createAdminPostService({
    adminPostRepository: repo.repository,
    contentProcessingService: content.service,
    cache: cacheParts.cache,
    searchProvider: search.searchProvider,
    searchRecordSource: search.searchRecordSource,
    searchSyncStatusReporter: searchStatus.reporter,
    now: () => new Date('2026-06-15T00:00:00.000Z'),
    generateId: () => 'new-id'
  })
  return {
    service,
    repo,
    content,
    deleted: cacheParts.deleted,
    deleteOptions: cacheParts.deleteOptions,
    operations,
    search,
    searchStatus
  }
}

describe('admin post service', () => {
  it('lists posts through the repository, forwarding the paging window and total', async () => {
    const { service } = build([
      editFixture({ id: 'p1', slug: 'p1' }),
      editFixture({ id: 'p2', slug: 'p2' }),
      editFixture({ id: 'p3', slug: 'p3' })
    ])

    const page = await service.list({ offset: 1, limit: 1 })

    expect(page.total).toBe(3)
    expect(page.items.map((post) => post.id)).toEqual(['p2'])
  })

  it('creates a draft, derives the slug, stores markdown and tags, and does not invalidate caches', async () => {
    const { service, repo, content, deleted } = build()

    const result = await service.create({
      type: 'article',
      title: 'Hello World',
      authorId: 'admin-1',
      categoryId: 'cat1',
      markdown: '# Hi',
      tagIds: ['t1'],
      seoTitle: 'SEO Hello'
    })

    expect(result).toEqual({ id: 'new-id', slug: 'hello-world' })
    expect(repo.calls.create).toHaveLength(1)
    expect(repo.calls.metadata).toEqual([{ postId: 'new-id', fields: { seoTitle: 'SEO Hello' } }])
    expect(content.calls.processAndStore).toEqual([{
      postId: 'new-id',
      markdown: '# Hi',
      customExcerpt: undefined
    }])
    expect(repo.calls.setTags).toEqual([{ postId: 'new-id', tagIds: ['t1'] }])
    expect(deleted).toHaveLength(0)
  })

  it('stores processed content before tags when creating a post', async () => {
    const { service, operations } = build()

    await service.create({
      type: 'article',
      title: 'Ordered Create',
      authorId: 'admin-1',
      markdown: '# Body',
      tagIds: ['t1']
    })

    expect(operations).toEqual(['post', 'content', 'tags'])
  })

  it('defaults an omitted category to the uncategorized system category on create', async () => {
    const { service, repo } = build()

    await service.create({ type: 'article', title: 'No Category', authorId: 'admin-1' })

    expect(repo.calls.create).toHaveLength(1)
    expect(repo.calls.create[0]).toMatchObject({ categoryId: UNCATEGORIZED_CATEGORY_ID })
  })

  it('loads a post for editing by its unique slug', async () => {
    const { service } = build([editFixture({ id: 'about-id', slug: 'about', type: 'page', title: 'About' })])

    const post = await service.getForEditBySlug('about')

    expect(post).toMatchObject({ id: 'about-id', slug: 'about', title: 'About' })
  })

  it('returns null from getForEditBySlug when no post has the requested slug', async () => {
    const { service } = build([editFixture({ id: 'p1', slug: 'hello' })])

    expect(await service.getForEditBySlug('about')).toBeNull()
  })

  it('resets an explicitly cleared category to uncategorized on update', async () => {
    const { service, repo } = build([editFixture({ id: 'p1', categoryId: 'cat1' })])

    await service.update('p1', { categoryId: null })

    expect(repo.calls.update).toHaveLength(1)
    expect(repo.calls.update[0]).toMatchObject({ fields: { categoryId: UNCATEGORIZED_CATEGORY_ID } })
  })

  it('leaves the category untouched when update omits it', async () => {
    const { service, repo } = build([editFixture({ id: 'p1', categoryId: 'cat1' })])

    await service.update('p1', { title: 'Renamed' })

    expect(repo.calls.update[0]).toMatchObject({ fields: { categoryId: undefined } })
  })

  it('rejects a duplicate slug', async () => {
    const { service } = build([editFixture({ id: 'p1', slug: 'taken' })])

    await expect(
      service.create({ type: 'article', title: 'X', slug: 'taken', authorId: 'admin-1' })
    ).rejects.toMatchObject({ code: 'slug_conflict', statusCode: 409 })
  })

  it('rejects a slug that normalizes to empty', async () => {
    const { service } = build()

    await expect(
      service.create({ type: 'article', title: '!!!', authorId: 'admin-1' })
    ).rejects.toMatchObject({ code: 'invalid_slug', statusCode: 422 })
  })

  it('invalidates public caches when updating a published post', async () => {
    const { service, deleted } = build([
      editFixture({ id: 'p1', slug: 'old', status: 'published', categoryId: 'cat1', tagIds: ['t1'] })
    ])

    await service.update('p1', { slug: 'new', markdown: '# x', categoryId: 'cat2', tagIds: ['t2'] })

    expect(deleted).toHaveLength(1)
    const keys = deleted[0]
    expect(keys).toEqual(expect.arrayContaining([
      'home:v2', 'archive', 'post-slug:old', 'post-slug:new',
      'category:cat1', 'category:cat2', 'tag:t1', 'tag:t2', cacheKeys.hotspots()
    ]))
    // A published article's change also invalidates the RSS feed and sitemap.
    expect(keys).toEqual(expect.arrayContaining(['rss', 'sitemap']))
  })

  it('stores processed content before replacing tags when updating a post', async () => {
    const { service, operations } = build([editFixture({ id: 'p1' })])

    await service.update('p1', { markdown: '# Updated', tagIds: ['t2'] })

    expect(operations).toEqual(['fields', 'content', 'tags'])
  })

  it('persists article SEO metadata and invalidates a published article', async () => {
    const { service, repo, deleted, operations } = build([
      editFixture({ id: 'p1', status: 'published', seoTitle: 'Old SEO' })
    ])

    await service.update('p1', {
      seoTitle: 'New SEO',
      seoDescription: null,
      jsonLdOverrideJson: '{"@type":"Article"}'
    })

    expect(repo.calls.metadata).toEqual([{
      postId: 'p1',
      fields: {
        seoTitle: 'New SEO',
        seoDescription: null,
        jsonLdOverrideJson: '{"@type":"Article"}'
      }
    }])
    expect(operations).toEqual(['fields', 'metadata'])
    expect(deleted[0]).toEqual(expect.arrayContaining(['post-slug:p1', 'rss', 'sitemap']))
  })

  it('does not invalidate caches when updating a draft', async () => {
    const { service, deleted } = build([editFixture({ id: 'p1', status: 'draft' })])

    await service.update('p1', { title: 'New Title' })

    expect(deleted).toHaveLength(0)
  })

  it('refuses to publish without valid processed content', async () => {
    const { service, repo } = build([editFixture({ id: 'p1', status: 'draft' })], { publishable: false })

    await expect(service.changeStatus('p1', 'published')).rejects.toMatchObject({ statusCode: 409 })
    expect(repo.calls.setStatus).toHaveLength(0)
  })

  it('publishes: stamps publishedAt and invalidates caches', async () => {
    const { service, repo, deleted } = build([editFixture({ id: 'p1', slug: 'p1', status: 'draft', publishedAt: null })])

    await service.changeStatus('p1', 'published')

    expect(repo.calls.setStatus).toEqual([
      { id: 'p1', status: 'published', publishedAt: new Date('2026-06-15T00:00:00.000Z') }
    ])
    expect(deleted[0]).toEqual(expect.arrayContaining([
      'home:v2', 'archive', 'post-slug:p1', cacheKeys.hotspots()
    ]))
  })

  it('unpublishes: keeps publishedAt and invalidates caches', async () => {
    const published = new Date('2026-06-10T00:00:00.000Z')
    const { service, repo, deleted, deleteOptions } = build([
      editFixture({ id: 'p1', status: 'published', publishedAt: published })
    ])

    await service.changeStatus('p1', 'draft')

    expect(repo.calls.setStatus).toEqual([{ id: 'p1', status: 'draft', publishedAt: published }])
    expect(deleted).toHaveLength(1)
    expect(deleted[0]).toContain(cacheKeys.hotspots())
    expect(deleteOptions[0]).toEqual({ forceGeneration: true })
  })

  it('deletes a published post and invalidates; a draft delete does not', async () => {
    const pub = build([editFixture({ id: 'p1', status: 'published' })])
    await pub.service.delete('p1')
    expect(pub.repo.calls.delete).toEqual(['p1'])
    expect(pub.deleted).toHaveLength(1)
    expect(pub.deleted[0]).toContain(cacheKeys.hotspots())
    expect(pub.deleteOptions[0]).toEqual({ forceGeneration: true })

    const draft = build([editFixture({ id: 'p2', status: 'draft' })])
    await draft.service.delete('p2')
    expect(draft.deleted).toHaveLength(0)
  })

  it('throws not_found for a missing post', async () => {
    const { service } = build()
    await expect(service.getForEdit('nope')).rejects.toMatchObject({ code: 'not_found', statusCode: 404 })
    await expect(service.changeStatus('nope', 'published')).rejects.toMatchObject({ code: 'not_found' })
    await expect(service.delete('nope')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('features one published article and invalidates the homepage projections', async () => {
    const { service, repo, deleted } = build([
      editFixture({ id: 'p1', status: 'published', featured: true }),
      editFixture({ id: 'p2', slug: 'p2', status: 'published' })
    ])

    await service.changeFeatured('p2', true)

    expect(repo.calls.setFeatured).toEqual([{ id: 'p2', featured: true }])
    expect(repo.posts.get('p1')?.featured).toBe(false)
    expect(repo.posts.get('p2')?.featured).toBe(true)
    expect(deleted.at(-1)).toEqual(['home:v2', 'featured-post:v2', cacheKeys.hotspots()])
  })

  it('rejects featuring drafts and page-type posts', async () => {
    const draft = build([editFixture({ id: 'draft', status: 'draft' })])
    await expect(draft.service.changeFeatured('draft', true)).rejects.toMatchObject({
      code: 'invalid_featured_post',
      statusCode: 422
    })

    const page = build([editFixture({ id: 'page', type: 'page', status: 'published' })])
    await expect(page.service.changeFeatured('page', true)).rejects.toMatchObject({
      code: 'invalid_featured_post',
      statusCode: 422
    })
  })

  it('delegates preview to the content pipeline', async () => {
    const { service, content } = build()
    await expect(service.previewMarkdown('# P')).resolves.toEqual({ html: '<p># P</p>' })
    expect(content.calls.preview).toEqual(['# P'])
  })

  it('indexes an article when it is published', async () => {
    const { service, search } = build([editFixture({ id: 'p1', status: 'draft' })])

    await service.changeStatus('p1', 'published')

    expect(search.calls.index).toHaveLength(1)
    expect(search.calls.index[0].objectID).toBe('p1')
    expect(search.calls.remove).toHaveLength(0)
  })

  it('re-indexes a published article on update', async () => {
    const { service, search } = build([editFixture({ id: 'p1', status: 'published' })])

    await service.update('p1', { markdown: '# Updated' })

    expect(search.calls.index).toEqual([expect.objectContaining({ objectID: 'p1' })])
  })

  it('removes the record when a published article is unpublished', async () => {
    const { service, search } = build([editFixture({ id: 'p1', status: 'published' })])

    await service.changeStatus('p1', 'draft')

    expect(search.calls.remove).toEqual(['p1'])
    expect(search.calls.index).toHaveLength(0)
  })

  it('removes the record when a published article is deleted', async () => {
    const { service, search } = build([editFixture({ id: 'p1', status: 'published' })])

    await service.delete('p1')

    expect(search.calls.remove).toEqual(['p1'])
  })

  it('never indexes a page-type post on publish', async () => {
    const { service, search } = build([editFixture({ id: 'p1', type: 'page', status: 'draft' })])

    await service.changeStatus('p1', 'published')

    expect(search.calls.index).toHaveLength(0)
    expect(search.calls.remove).toHaveLength(0)
  })

  it('does not index a draft on update', async () => {
    const { service, search } = build([editFixture({ id: 'p1', status: 'draft' })])

    await service.update('p1', { markdown: '# Draft' })

    expect(search.calls.index).toHaveLength(0)
  })

  it('skips indexing when no record can be assembled', async () => {
    const { service, search, searchStatus } = build([editFixture({ id: 'p1', status: 'draft' })], {}, { record: null })

    await service.changeStatus('p1', 'published')

    expect(search.calls.index).toHaveLength(0)
    expect(searchStatus.calls.failures).toHaveLength(1)
  })

  it('isolates search failures: publish/update/delete still succeed', async () => {
    const publish = build([editFixture({ id: 'p1', status: 'draft' })], {}, { fail: true })
    await expect(publish.service.changeStatus('p1', 'published')).resolves.toBeUndefined()
    expect(publish.repo.calls.setStatus).toHaveLength(1)
    expect(publish.searchStatus.calls.failures).toEqual([{ postId: 'p1', operation: 'upsert' }])

    const update = build([editFixture({ id: 'p2', slug: 'p2', status: 'published' })], {}, { fail: true })
    await expect(update.service.update('p2', { markdown: '# x' })).resolves.toEqual({
      id: 'p2',
      slug: 'p2'
    })

    const remove = build([editFixture({ id: 'p3', status: 'published' })], {}, { fail: true })
    await expect(remove.service.delete('p3')).resolves.toBeUndefined()
    expect(remove.repo.calls.delete).toEqual(['p3'])
    expect(remove.searchStatus.calls.failures).toEqual([{ postId: 'p3', operation: 'remove' }])
  })

  it('clears a persisted search error after a successful write sync', async () => {
    const { service, searchStatus } = build([editFixture({ id: 'p1', status: 'draft' })])

    await service.changeStatus('p1', 'published')

    expect(searchStatus.calls.successes).toEqual([{ postId: 'p1', operation: 'upsert' }])
    expect(searchStatus.calls.failures).toEqual([])
  })
})
