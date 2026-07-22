import { vi } from 'vitest'
import { createTaxonomyReadService } from '../../../server/services/taxonomy-read-service'
import type { CacheProvider } from '../../../server/providers/cache/cache-provider'
import type {
  PostReadRepository,
  PublicCategory,
  PublicCategoryRecord,
  PublicListPage,
  PublicPostListItem,
  PublicTag,
  PublicTagRecord,
  TaxonomyReadRepository
} from '../../../server/repositories/contracts/public-read-repositories'

const emptyPage: PublicListPage<PublicPostListItem> = { items: [], nextCursor: null }

const category: PublicCategory = {
  slug: 'cat1',
  name: 'Cat One',
  description: null,
  color: null,
  articleCount: 2
}
const categoryRecord: PublicCategoryRecord = { id: 'c1', ...category }

const tag: PublicTag = {
  slug: 't1',
  name: 'Tag One',
  description: null,
  color: null,
  articleCount: 2
}
const tagRecord: PublicTagRecord = { id: 'tag1', ...tag }

const articles: PublicListPage<PublicPostListItem> = {
  items: [
    {
      id: 'a',
      slug: 'a',
      title: 'A',
      cover: null,
      excerpt: null,
      readingTime: 1,
      publishedAt: new Date('2026-06-01T00:00:00.000Z'),
      category: { slug: 'cat1', name: 'Cat One' },
      tags: []
    }
  ],
  nextCursor: null
}

function createFakeTaxonomyRepo(values: {
  categories?: PublicCategory[]
  tags?: PublicTag[]
  category?: PublicCategoryRecord | null
  tag?: PublicTagRecord | null
}): TaxonomyReadRepository {
  return {
    async listCategoriesWithCounts() {
      return values.categories ?? []
    },
    async findCategoryBySlug() {
      return values.category ?? null
    },
    async listTagsWithCounts() {
      return values.tags ?? []
    },
    async findTagBySlug() {
      return values.tag ?? null
    }
  }
}

function createFakeCache() {
  const store = new Map<string, unknown>()
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
      for (const key of keys) store.delete(key)
    }
  }
  return { cache, calls }
}

function createFakePostRepo(): PostReadRepository {
  return {
    async listHomeArticles(query) {
      return { items: [], page: query.page, pageSize: query.limit, total: 0, pageCount: 0, sort: query.sort, order: query.order }
    },
    async listPublishedArticles() {
      return emptyPage
    },
    async findPublishedDetailBySlug() {
      return null
    },
    async listPublishedArticlesByCategorySlug() {
      return articles
    },
    async listPublishedArticlesByTagSlug() {
      return articles
    },
    async listArchive() {
      return []
    },
    async listFeedPosts() {
      return []
    },
    async listPublishedArticleIds() {
      return []
    },
    async listPublishedArticlesByIds() {
      return []
    }
  }
}

describe('taxonomy read service', () => {
  it('lists categories and tags', async () => {
    const { cache } = createFakeCache()
    const service = createTaxonomyReadService({
      postReadRepository: createFakePostRepo(),
      taxonomyReadRepository: createFakeTaxonomyRepo({ categories: [category], tags: [tag] }),
      cache
    })

    await expect(service.getCategories()).resolves.toEqual([category])
    await expect(service.getTags()).resolves.toEqual([tag])
  })

  it('returns category detail with its published articles', async () => {
    const { cache, calls } = createFakeCache()
    const service = createTaxonomyReadService({
      postReadRepository: createFakePostRepo(),
      taxonomyReadRepository: createFakeTaxonomyRepo({ category: categoryRecord }),
      cache
    })

    await expect(service.getCategoryDetail('cat1', { limit: 20 })).resolves.toEqual({
      category,
      articles
    })
    expect(calls.get).toEqual(['category:c1'])
    expect(calls.set).toEqual(['category:c1'])
  })

  it('returns tag detail with its published articles', async () => {
    const { cache, calls } = createFakeCache()
    const service = createTaxonomyReadService({
      postReadRepository: createFakePostRepo(),
      taxonomyReadRepository: createFakeTaxonomyRepo({ tag: tagRecord }),
      cache
    })

    await expect(service.getTagDetail('t1', { limit: 20 })).resolves.toEqual({ tag, articles })
    expect(calls.get).toEqual(['tag:tag1'])
    expect(calls.set).toEqual(['tag:tag1'])
  })

  it('reuses canonical taxonomy detail cache entries but bypasses cache for custom pages', async () => {
    const postRepository = createFakePostRepo()
    const categoryArticles = vi.spyOn(postRepository, 'listPublishedArticlesByCategorySlug')
    const { cache, calls } = createFakeCache()
    const service = createTaxonomyReadService({
      postReadRepository: postRepository,
      taxonomyReadRepository: createFakeTaxonomyRepo({ category: categoryRecord }),
      cache
    })

    await service.getCategoryDetail('cat1', { limit: 20 })
    await service.getCategoryDetail('cat1', { limit: 20 })
    await service.getCategoryDetail('cat1', { limit: 5 })

    expect(categoryArticles).toHaveBeenCalledTimes(2)
    expect(calls.get).toEqual(['category:c1', 'category:c1'])
  })

  it('throws not_found for unknown category or tag slugs', async () => {
    const { cache } = createFakeCache()
    const service = createTaxonomyReadService({
      postReadRepository: createFakePostRepo(),
      taxonomyReadRepository: createFakeTaxonomyRepo({ category: null, tag: null }),
      cache
    })

    await expect(service.getCategoryDetail('nope', { limit: 20 })).rejects.toMatchObject({
      code: 'not_found',
      statusCode: 404
    })
    await expect(service.getTagDetail('nope', { limit: 20 })).rejects.toMatchObject({
      code: 'not_found',
      statusCode: 404
    })
  })
})
