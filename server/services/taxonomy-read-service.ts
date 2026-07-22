import { publicReadError } from '../domain/public-read-errors'
import type { CacheProvider } from '../providers/cache/cache-provider'
import type {
  PostReadRepository,
  PublicCategory,
  PublicListPage,
  PublicListQuery,
  PublicPostListItem,
  PublicTag,
  TaxonomyReadRepository
} from '../repositories/contracts/public-read-repositories'
import { DEFAULT_PUBLIC_LIST_LIMIT } from '../repositories/contracts/public-read-repositories'
import { cacheKeys } from '../utils/cache-keys'

export interface CategoryDetail {
  category: PublicCategory
  articles: PublicListPage<PublicPostListItem>
}

export interface TagDetail {
  tag: PublicTag
  articles: PublicListPage<PublicPostListItem>
}

export interface TaxonomyReadServiceDependencies {
  postReadRepository: PostReadRepository
  taxonomyReadRepository: TaxonomyReadRepository
  cache: CacheProvider
}

export function createTaxonomyReadService(dependencies: TaxonomyReadServiceDependencies) {
  const { postReadRepository, taxonomyReadRepository, cache } = dependencies

  function isCanonicalFirstPage(query: PublicListQuery): boolean {
    return !query.cursor && query.limit === DEFAULT_PUBLIC_LIST_LIMIT
  }

  return {
    getCategories(): Promise<PublicCategory[]> {
      return taxonomyReadRepository.listCategoriesWithCounts()
    },

    async getCategoryDetail(slug: string, query: PublicListQuery): Promise<CategoryDetail> {
      const record = await taxonomyReadRepository.findCategoryBySlug(slug)
      if (!record) {
        throw publicReadError('not_found', 'Category not found', 404)
      }
      const { id, ...category } = record

      if (isCanonicalFirstPage(query)) {
        const key = cacheKeys.category(id)
        const cached = await cache.get<CategoryDetail>(key)
        if (cached !== null) return cached

        const articles = await postReadRepository.listPublishedArticlesByCategorySlug(slug, query)
        const detail = { category, articles }
        await cache.set(key, detail)
        return detail
      }

      const articles = await postReadRepository.listPublishedArticlesByCategorySlug(slug, query)
      return { category, articles }
    },

    getTags(): Promise<PublicTag[]> {
      return taxonomyReadRepository.listTagsWithCounts()
    },

    async getTagDetail(slug: string, query: PublicListQuery): Promise<TagDetail> {
      const record = await taxonomyReadRepository.findTagBySlug(slug)
      if (!record) {
        throw publicReadError('not_found', 'Tag not found', 404)
      }
      const { id, ...tag } = record

      if (isCanonicalFirstPage(query)) {
        const key = cacheKeys.tag(id)
        const cached = await cache.get<TagDetail>(key)
        if (cached !== null) return cached

        const articles = await postReadRepository.listPublishedArticlesByTagSlug(slug, query)
        const detail = { tag, articles }
        await cache.set(key, detail)
        return detail
      }

      const articles = await postReadRepository.listPublishedArticlesByTagSlug(slug, query)
      return { tag, articles }
    }
  }
}

export type TaxonomyReadService = ReturnType<typeof createTaxonomyReadService>
