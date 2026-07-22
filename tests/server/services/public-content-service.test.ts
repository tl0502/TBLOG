import { createPublicContentService } from '../../../server/services/public-content-service'
import type { CacheProvider } from '../../../server/providers/cache/cache-provider'
import type {
  ArchiveGroup,
  PostReadRepository,
  PublicHomeFeedPage,
  PublicListPage,
  PublicPostDetail,
  PublicPostDetailSource,
  PublicPostListItem
} from '../../../server/repositories/contracts/public-read-repositories'

const emptyPage: PublicListPage<PublicPostListItem> = { items: [], nextCursor: null }

const codeMeta = [
  { index: 0, language: 'ts', filename: null, highlightedLines: [], collapsed: false, diff: false }
]

const detailSource: PublicPostDetailSource = {
  id: 'a',
  slug: 'a',
  title: 'A',
  excerpt: 'Excerpt A',
  readingTime: 1,
  publishedAt: new Date('2026-06-01T00:00:00.000Z'),
  category: null,
  tags: [],
  type: 'article',
  html: '<h1>A</h1>',
  tocJson: null,
  codeMetaJson: JSON.stringify(codeMeta),
  cover: 'https://cdn.example/a.png',
  seoTitle: 'SEO A',
  seoDescription: null,
  canonicalUrlOverride: null,
  openGraphImageUrl: null,
  twitterImageUrl: null,
  jsonLdOverrideJson: null
}

const detail: PublicPostDetail = {
  id: 'a',
  slug: 'a',
  title: 'A',
  excerpt: 'Excerpt A',
  readingTime: 1,
  publishedAt: new Date('2026-06-01T00:00:00.000Z'),
  category: null,
  tags: [],
  type: 'article',
  html: '<h1>A</h1>',
  tocJson: null,
  codeMeta,
  cover: 'https://cdn.example/a.png',
  seoTitle: 'SEO A',
  seoDescription: null,
  canonicalUrlOverride: null,
  openGraphImageUrl: null,
  twitterImageUrl: null,
  jsonLdOverrideJson: null,
  pageViews: null,
  analyticsUpdatedAt: null
}

const feed: PublicListPage<PublicPostListItem> = {
  items: [
    {
      id: 'a',
      slug: 'a',
      title: 'A',
      cover: null,
      excerpt: 'Excerpt A',
      readingTime: 1,
      publishedAt: new Date('2026-06-01T00:00:00.000Z'),
      category: null,
      tags: []
    }
  ],
  nextCursor: null
}

const homeFeed: PublicHomeFeedPage<PublicPostListItem> = {
  items: feed.items,
  page: 1,
  pageSize: 25,
  total: 1,
  pageCount: 1,
  sort: 'publishedAt',
  order: 'desc'
}

function createFakeRepo(values: {
  detail?: PublicPostDetailSource | null
  feed?: PublicListPage<PublicPostListItem>
  archive?: ArchiveGroup[]
}) {
  const calls = { detail: 0, list: 0, archive: 0 }
  const repository: PostReadRepository = {
    async listHomeArticles(query) {
      calls.list += 1
      return {
        ...(values.feed ? { ...homeFeed, items: values.feed.items } : homeFeed),
        page: query.page,
        pageSize: query.limit,
        sort: query.sort,
        order: query.order
      }
    },
    async listPublishedArticles() {
      calls.list += 1
      return values.feed ?? emptyPage
    },
    async findPublishedDetailBySlug() {
      calls.detail += 1
      return values.detail ?? null
    },
    async listPublishedArticlesByCategorySlug() {
      return emptyPage
    },
    async listPublishedArticlesByTagSlug() {
      return emptyPage
    },
    async listArchive() {
      calls.archive += 1
      return values.archive ?? []
    },
    async listFeedPosts() {
      return []
    },
    async listPublishedArticleIds() {
      return (values.feed ?? feed).items.map((item) => item.id)
    },
    async listPublishedArticlesByIds() {
      return []
    }
  }
  return { repository, calls }
}

function createFakeCache(seed: Map<string, unknown> = new Map()) {
  const store = seed
  const calls = { get: [] as string[], set: [] as string[] }
  const cache: CacheProvider = {
    async get<T>(key: string) {
      calls.get.push(key)
      return (store.has(key) ? store.get(key) : null) as T | null
    },
    async set<T>(key: string, value: T) {
      calls.set.push(key)
      store.set(key, value)
    },
    async delete(keys: string[]) {
      for (const key of keys) {
        store.delete(key)
      }
    }
  }
  return { cache, calls }
}

describe('public content service', () => {
  it('returns post detail and caches it on a miss', async () => {
    const { repository, calls } = createFakeRepo({ detail: detailSource })
    const { cache, calls: cacheCalls } = createFakeCache()
    const service = createPublicContentService({ postReadRepository: repository, cache })

    await expect(service.getPostDetail('a')).resolves.toEqual(detail)
    expect(cacheCalls.get).toContain('post-slug:a')
    expect(cacheCalls.set).toContain('post-slug:a')
    expect(calls.detail).toBe(1)
  })

  it('defaults codeMeta to [] when the stored json is null or invalid', async () => {
    for (const codeMetaJson of [null, 'not json', '{"not":"an array"}']) {
      const { repository } = createFakeRepo({ detail: { ...detailSource, codeMetaJson } })
      const { cache } = createFakeCache()
      const service = createPublicContentService({ postReadRepository: repository, cache })

      const result = await service.getPostDetail('a')
      expect(result.codeMeta).toEqual([])
    }
  })

  it('drops malformed codeMeta entries and keeps well-formed ones', async () => {
    const good = { index: 0, language: 'ts', filename: null, highlightedLines: [1], collapsed: false, diff: false }
    const codeMetaJson = JSON.stringify([
      good,
      { index: 1 }, // missing required fields
      { index: 'two', language: null, filename: null, highlightedLines: [], collapsed: false, diff: false },
      null,
      'string'
    ])
    const { repository } = createFakeRepo({ detail: { ...detailSource, codeMetaJson } })
    const { cache } = createFakeCache()
    const service = createPublicContentService({ postReadRepository: repository, cache })

    const result = await service.getPostDetail('a')
    expect(result.codeMeta).toEqual([good])
  })

  it('returns cached post detail without hitting the repository', async () => {
    const { repository, calls } = createFakeRepo({ detail: null })
    const { cache } = createFakeCache(new Map([['post-slug:a', detail]]))
    const service = createPublicContentService({ postReadRepository: repository, cache })

    await expect(service.getPostDetail('a')).resolves.toEqual(detail)
    expect(calls.detail).toBe(0)
  })

  it('throws not_found for missing or draft posts', async () => {
    const { repository } = createFakeRepo({ detail: null })
    const { cache } = createFakeCache()
    const service = createPublicContentService({ postReadRepository: repository, cache })

    await expect(service.getPostDetail('missing')).rejects.toMatchObject({
      code: 'not_found',
      statusCode: 404
    })
  })

  it('caches only the canonical home feed and reads alternate pages through', async () => {
    const { repository, calls } = createFakeRepo({ feed })
    const { cache, calls: cacheCalls } = createFakeCache()
    const service = createPublicContentService({ postReadRepository: repository, cache })

    await service.getHomeFeed({ page: 1, limit: 25, sort: 'publishedAt', order: 'desc' })
    await service.getHomeFeed({ page: 2, limit: 25, sort: 'publishedAt', order: 'desc' })

    expect(cacheCalls.get.filter((key) => key === 'home:v2')).toHaveLength(1)
    expect(calls.list).toBe(2)
  })

  it('reads a non-default first-page limit straight through without touching the home cache', async () => {
    const { repository, calls } = createFakeRepo({ feed })
    const { cache, calls: cacheCalls } = createFakeCache()
    const service = createPublicContentService({ postReadRepository: repository, cache })

    await service.getHomeFeed({ page: 1, limit: 5, sort: 'publishedAt', order: 'desc' })

    expect(cacheCalls.get).not.toContain('home:v2')
    expect(cacheCalls.set).not.toContain('home:v2')
    expect(calls.list).toBe(1)
  })

  it('sorts the complete published report globally and degrades explicitly when it is unavailable', async () => {
    const { repository } = createFakeRepo({ feed })
    const items = ['a', 'b', 'c'].map((id) => ({ ...feed.items[0]!, id, slug: id, title: id.toUpperCase() }))
    repository.listPublishedArticlesByIds = vi.fn(async (ids: string[]) => ids.flatMap((id: string) => {
      const item = items.find((candidate) => candidate.id === id)
      return item ? [item] : []
    }))
    repository.listPublishedArticleIds = vi.fn(async () => ['a', 'b', 'c'])
    const { cache } = createFakeCache()
    const report = {
      revision: 'rev-1',
      publishedAt: '2026-07-19T00:00:00.000Z',
      articles: [
        { postId: 'a', pageViews: 10, publishedAt: '2026-07-01T00:00:00.000Z' },
        { postId: 'b', pageViews: 30, publishedAt: '2026-07-02T00:00:00.000Z' },
        { postId: 'c', pageViews: 20, publishedAt: '2026-07-03T00:00:00.000Z' }
      ]
    }
    const service = createPublicContentService({
      postReadRepository: repository,
      cache,
      analyticsReportService: { getCurrentReport: vi.fn().mockResolvedValue(report) } as never
    })

    const ranked = await service.getHomeFeed({ page: 1, limit: 2, sort: 'pageViews', order: 'desc' })
    expect(ranked.items.map((item) => item.id)).toEqual(['b', 'c'])
    expect(ranked).toMatchObject({ total: 3, pageCount: 2, effectiveSort: 'pageViews', statisticsAvailable: true, reportRevision: 'rev-1' })

    const degraded = createPublicContentService({
      postReadRepository: repository,
      cache,
      analyticsReportService: { getCurrentReport: vi.fn().mockResolvedValue(null) } as never
    })
    await expect(degraded.getHomeFeed({ page: 1, limit: 2, sort: 'pageViews', order: 'asc' }))
      .resolves.toMatchObject({ sort: 'pageViews', order: 'asc', effectiveSort: 'publishedAt', statisticsAvailable: false })
  })

  it('paginates the request-reconciled snapshot without a second published-id query', async () => {
    const { repository } = createFakeRepo({ feed })
    const items = ['a', 'c', 'd'].map((id) => ({ ...feed.items[0]!, id, slug: id, title: id.toUpperCase() }))
    repository.listPublishedArticleIds = vi.fn(async () => ['a', 'c', 'd'])
    repository.listPublishedArticlesByIds = vi.fn(async (ids: string[]) => ids.flatMap((id) => {
      const item = items.find((candidate) => candidate.id === id)
      return item ? [item] : []
    }))
    const { cache } = createFakeCache()
    const service = createPublicContentService({
      postReadRepository: repository,
      cache,
      analyticsReportService: {
        getCurrentReport: vi.fn().mockResolvedValue({
          revision: 'content-revision',
          publishedAt: '2026-07-19T00:00:00.000Z',
          articles: [
            { postId: 'c', pageViews: 30, publishedAt: '2026-07-03T00:00:00.000Z' },
            { postId: 'd', pageViews: 20, publishedAt: '2026-07-02T00:00:00.000Z' },
            { postId: 'a', pageViews: 10, publishedAt: '2026-07-01T00:00:00.000Z' }
          ]
        })
      } as never
    })

    const first = await service.getHomeFeed({ page: 1, limit: 2, sort: 'pageViews', order: 'desc' })
    const second = await service.getHomeFeed({ page: 2, limit: 2, sort: 'pageViews', order: 'desc' })

    expect(first.items.map((item) => item.id)).toEqual(['c', 'd'])
    expect(first).toMatchObject({ total: 3, pageCount: 2 })
    expect(second.items.map((item) => item.id)).toEqual(['a'])
    const clamped = await service.getHomeFeed({ page: 99, limit: 2, sort: 'pageViews', order: 'desc' })
    expect(clamped).toMatchObject({ page: 2, total: 3, pageCount: 2 })
    expect(clamped.items.map((item) => item.id)).toEqual(['a'])
    expect(repository.listPublishedArticleIds).not.toHaveBeenCalled()
  })

  it('does not read the incompatible legacy home cache entry', async () => {
    const { repository, calls } = createFakeRepo({ feed })
    const { cache, calls: cacheCalls } = createFakeCache(new Map([['home', feed]]))
    const service = createPublicContentService({ postReadRepository: repository, cache })

    await service.getHomeFeed({ page: 1, limit: 25, sort: 'publishedAt', order: 'desc' })

    expect(calls.list).toBe(1)
    expect(cacheCalls.get).toContain('home:v2')
    expect(cacheCalls.set).toContain('home:v2')
  })

  it('caches the archive under the archive key', async () => {
    const { repository } = createFakeRepo({ archive: [{ year: 2026, month: 6, items: feed.items }] })
    const { cache, calls: cacheCalls } = createFakeCache()
    const service = createPublicContentService({ postReadRepository: repository, cache })

    await service.getArchive()
    expect(cacheCalls.get).toContain('archive')
    expect(cacheCalls.set).toContain('archive')
  })

  it('returns and caches the separately selected featured article', async () => {
    const { repository } = createFakeRepo({ feed })
    const { cache, calls } = createFakeCache()
    const featuredPostReadRepository = {
      findFeaturedPublishedArticles: vi.fn(async () => feed.items.slice(0, 1))
    }
    const service = createPublicContentService({
      postReadRepository: repository,
      featuredPostReadRepository,
      cache
    })

    await expect(service.getFeaturedPosts()).resolves.toEqual(feed.items.slice(0, 1))
    expect(calls.get).toContain('featured-post:v2')
    expect(calls.set).toContain('featured-post:v2')
    expect(featuredPostReadRepository.findFeaturedPublishedArticles).toHaveBeenCalledOnce()
  })

  it('falls back to the newest article and caches the effective carousel result', async () => {
    const { repository, calls } = createFakeRepo({ feed })
    const { cache } = createFakeCache()
    const featuredPostReadRepository = {
      findFeaturedPublishedArticles: vi.fn(async () => [])
    }
    const service = createPublicContentService({
      postReadRepository: repository,
      featuredPostReadRepository,
      cache
    })

    await expect(service.getFeaturedPosts()).resolves.toEqual(feed.items)
    await expect(service.getFeaturedPosts()).resolves.toEqual(feed.items)
    expect(featuredPostReadRepository.findFeaturedPublishedArticles).toHaveBeenCalledOnce()
    expect(calls.list).toBe(1)
  })
})
