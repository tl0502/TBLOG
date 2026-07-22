import { publicReadError } from '../domain/public-read-errors'
import type { CodeBlockMeta } from '../content/code-meta'
import type { CacheProvider } from '../providers/cache/cache-provider'
import type {
  ArchiveGroup,
  FeaturedPostReadRepository,
  PostReadRepository,
  PublicHomeFeedPage,
  PublicHomeFeedQuery,
  PublicPostDetail,
  PublicPostListItem
} from '../repositories/contracts/public-read-repositories'
import { cacheKeys } from '../utils/cache-keys'
import type { AnalyticsReportReader } from './analytics-report-service'
import { HOME_FEED_PAGE_SIZE } from '../../types/home-feed'

export interface PublicContentServiceDependencies {
  postReadRepository: PostReadRepository
  featuredPostReadRepository?: FeaturedPostReadRepository
  cache: CacheProvider
  analyticsReportService?: AnalyticsReportReader
}

/** Defensively parse the stored `code_meta_json` string; null/invalid/malformed entries → dropped. */
function parseCodeMeta(json: string | null): CodeBlockMeta[] {
  if (!json) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) {
    return []
  }

  const items: CodeBlockMeta[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const candidate = entry as Record<string, unknown>
    if (
      typeof candidate.index === 'number' &&
      (typeof candidate.language === 'string' || candidate.language === null) &&
      (typeof candidate.filename === 'string' || candidate.filename === null) &&
      Array.isArray(candidate.highlightedLines) &&
      candidate.highlightedLines.every((line) => typeof line === 'number') &&
      typeof candidate.collapsed === 'boolean' &&
      typeof candidate.diff === 'boolean'
    ) {
      items.push({
        index: candidate.index,
        language: candidate.language as string | null,
        filename: candidate.filename as string | null,
        highlightedLines: candidate.highlightedLines as number[],
        collapsed: candidate.collapsed,
        diff: candidate.diff
      })
    }
  }

  return items
}

export function createPublicContentService(dependencies: PublicContentServiceDependencies) {
  const { postReadRepository, cache } = dependencies

  async function readThrough<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = await cache.get<T>(key)
    if (cached !== null) {
      return cached
    }
    const value = await loader()
    await cache.set(key, value)
    return value
  }

  return {
    // Only the canonical first page is cached under the versioned `home` resource key. Alternate
    // pages and sort orders read through so analytics ordering never poisons that shared entry.
    async getHomeFeed(query: PublicHomeFeedQuery): Promise<PublicHomeFeedPage<PublicPostListItem>> {
      const report = await dependencies.analyticsReportService?.getCurrentReport() ?? null
      if (query.sort === 'pageViews') {
        if (!report) {
          const fallback = await postReadRepository.listHomeArticles({ ...query, sort: 'publishedAt', order: 'desc' })
          return {
            ...fallback,
            sort: query.sort,
            order: query.order,
            effectiveSort: 'publishedAt',
            statisticsAvailable: false,
            reportRevision: null,
            reportUpdatedAt: null
          }
        }
        const direction = query.order === 'asc' ? 1 : -1
        const ranked = [...report.articles].sort((left, right) => {
          const views = direction * (left.pageViews - right.pageViews)
          if (views !== 0) return views
          const published = Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
          return published || right.postId.localeCompare(left.postId)
        })
        const total = ranked.length
        const pageCount = Math.ceil(total / query.limit)
        const page = pageCount > 0 ? Math.min(query.page, pageCount) : 1
        const selected = ranked.slice((page - 1) * query.limit, page * query.limit)
        return {
          items: await postReadRepository.listPublishedArticlesByIds(selected.map((row) => row.postId)),
          page,
          pageSize: query.limit,
          total,
          pageCount,
          sort: query.sort,
          order: query.order,
          effectiveSort: query.sort,
          statisticsAvailable: true,
          reportRevision: report.revision,
          reportUpdatedAt: report.publishedAt
        }
      }
      const canonical = query.page === 1
        && query.limit === HOME_FEED_PAGE_SIZE
        && query.sort === 'publishedAt'
        && query.order === 'desc'
      if (!canonical) {
        const page = await postReadRepository.listHomeArticles(query)
        return {
          ...page,
          effectiveSort: query.sort,
          statisticsAvailable: Boolean(report),
          reportRevision: report?.revision ?? null,
          reportUpdatedAt: report?.publishedAt ?? null
        }
      }
      const page = await readThrough(cacheKeys.home(), () => postReadRepository.listHomeArticles(query))
      return {
        ...page,
        effectiveSort: query.sort,
        statisticsAvailable: Boolean(report),
        reportRevision: report?.revision ?? null,
        reportUpdatedAt: report?.publishedAt ?? null
      }
    },

    async getFeaturedPosts(): Promise<PublicPostListItem[]> {
      if (!dependencies.featuredPostReadRepository) {
        return []
      }
      // Cache an envelope so an empty site result is distinct from the CacheProvider miss sentinel.
      // The effective carousel includes a newest-article fallback when no article is selected.
      const key = cacheKeys.featuredPost()
      const cached = await cache.get<{ value: PublicPostListItem[] }>(key)
      if (cached !== null) return cached.value

      const selected = await dependencies.featuredPostReadRepository.findFeaturedPublishedArticles()
      const value = selected.length
        ? selected
        : (await postReadRepository.listPublishedArticles({ limit: 1 })).items
      await cache.set(key, { value })
      return value
    },

    async getPostDetail(slug: string): Promise<PublicPostDetail> {
      const key = cacheKeys.postSlug(slug)
      const cached = await cache.get<Omit<PublicPostDetail, 'pageViews'>>(key)
      if (cached) {
        const report = await dependencies.analyticsReportService?.getCurrentReport() ?? null
        const stats = report?.articles.find((row) => row.postId === cached.id)
        return { ...cached, pageViews: stats?.pageViews ?? null, analyticsUpdatedAt: report?.publishedAt ?? null }
      }

      const source = await postReadRepository.findPublishedDetailBySlug(slug)
      if (!source) {
        throw publicReadError('not_found', 'Post not found', 404)
      }

      const { codeMetaJson, ...rest } = source
      const detail = { ...rest, codeMeta: parseCodeMeta(codeMetaJson) }

      await cache.set(key, detail)
      const report = await dependencies.analyticsReportService?.getCurrentReport() ?? null
      const stats = report?.articles.find((row) => row.postId === detail.id)
      return { ...detail, pageViews: stats?.pageViews ?? null, analyticsUpdatedAt: report?.publishedAt ?? null }
    },

    getArchive(): Promise<ArchiveGroup[]> {
      return readThrough(cacheKeys.archive(), () => postReadRepository.listArchive())
    }
  }
}

export type PublicContentService = ReturnType<typeof createPublicContentService>
