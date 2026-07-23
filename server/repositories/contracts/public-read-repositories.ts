import type { CodeBlockMeta } from '../../content/code-meta'
import type { PostType } from '../../domain/post'
import type { HomeFeedMeta, HomeFeedSort, SortOrder } from '../../../types/home-feed'

/** Default page size for public lists when the client does not specify `limit`. */
export const DEFAULT_PUBLIC_LIST_LIMIT = 20

export interface PublicPostListItem {
  id: string
  slug: string
  title: string
  cover: string | null
  excerpt: string | null
  readingTime: number
  publishedAt: Date
  category: { slug: string; name: string } | null
  tags: { slug: string; name: string }[]
}

/**
 * Per-post SEO metadata (`post_metadata`) projected onto public detail reads. Every field is
 * nullable and public-safe; the page and feed layers apply site-level fallbacks. `cover` comes from
 * `posts.cover` and doubles as the Open Graph image fallback.
 */
export interface PublicPostSeoMetadata {
  seoTitle: string | null
  seoDescription: string | null
  canonicalUrlOverride: string | null
  openGraphImageUrl: string | null
  twitterImageUrl: string | null
  jsonLdOverrideJson: string | null
}

export interface PublicPostDetail extends PublicPostListItem, PublicPostSeoMetadata {
  type: PostType
  /** Last modification time for JSON-LD `dateModified` and article meta. */
  updatedAt: Date
  html: string
  tocJson: string | null
  codeMeta: CodeBlockMeta[]
  pageViews?: number | null
  analyticsUpdatedAt?: string | null
}

/**
 * Raw detail row as read by the repository. `codeMetaJson` is the stored
 * `post_content.code_meta_json` string; the service parses it into `codeMeta`.
 */
export interface PublicPostDetailSource extends PublicPostListItem, PublicPostSeoMetadata {
  type: PostType
  updatedAt: Date
  html: string
  tocJson: string | null
  codeMetaJson: string | null
}

/**
 * Minimal published-post projection for feeds and the sitemap.
 * `updatedAt` feeds sitemap `lastmod`; RSS prefers `seoTitle`/`seoDescription` then title/excerpt.
 */
export interface FeedPostRef {
  slug: string
  title: string
  excerpt: string | null
  seoTitle: string | null
  seoDescription: string | null
  type: PostType
  publishedAt: Date
  updatedAt: Date
}

/** Bounded feed/sitemap query so RSS does not load every published row into memory. */
export interface FeedPostQuery {
  /**
   * `articles`: published articles only (RSS).
   * `sitemap`: published articles plus the About page (public sitemap surface).
   */
  scope: 'articles' | 'sitemap'
  /** Optional SQL LIMIT; omit for the full sitemap set. */
  limit?: number
}

export interface PublicCategory {
  slug: string
  name: string
  description: string | null
  color: string | null
  articleCount: number
}

/** Internal repository identity used for resource-oriented cache keys; controllers never expose it. */
export interface PublicCategoryRecord extends PublicCategory {
  id: string
}

export interface PublicTag {
  slug: string
  name: string
  description: string | null
  color: string | null
  articleCount: number
}

/** Internal repository identity used for resource-oriented cache keys; controllers never expose it. */
export interface PublicTagRecord extends PublicTag {
  id: string
}

export interface ArchiveGroup {
  year: number
  month: number
  items: PublicPostListItem[]
}

export interface PublicListPage<T> {
  items: T[]
  nextCursor: string | null
}

export interface PublicHomeFeedPage<T> extends HomeFeedMeta {
  items: T[]
}

export interface PublicHomeFeedQuery {
  page: number
  limit: number
  sort: HomeFeedSort
  order: SortOrder
}

export interface PublicListQuery {
  cursor?: string
  limit: number
}

export interface PostReadRepository {
  listHomeArticles(query: PublicHomeFeedQuery): Promise<PublicHomeFeedPage<PublicPostListItem>>
  listPublishedArticles(query: PublicListQuery): Promise<PublicListPage<PublicPostListItem>>
  findPublishedDetailBySlug(slug: string): Promise<PublicPostDetailSource | null>
  listPublishedArticlesByCategorySlug(
    slug: string,
    query: PublicListQuery
  ): Promise<PublicListPage<PublicPostListItem>>
  listPublishedArticlesByTagSlug(
    slug: string,
    query: PublicListQuery
  ): Promise<PublicListPage<PublicPostListItem>>
  listArchive(): Promise<ArchiveGroup[]>
  /**
   * Published posts for syndication. `scope: 'articles'` powers RSS (optional LIMIT);
   * `scope: 'sitemap'` returns articles plus the About page only.
   */
  listFeedPosts(query: FeedPostQuery): Promise<FeedPostRef[]>
  /** Current published article ids used to reconcile stale external report rankings. */
  listPublishedArticleIds(): Promise<string[]>
  listPublishedArticlesByIds(ids: string[]): Promise<PublicPostListItem[]>
}

export interface HotspotPostReadRepository {
  listPublishedArticles(query: PublicListQuery): Promise<PublicListPage<PublicPostListItem>>
  listPublishedArticlesBySlugs(slugs: string[]): Promise<PublicPostListItem[]>
  listPublishedArticlesByIds(ids: string[]): Promise<PublicPostListItem[]>
}

export interface FeaturedPostReadRepository {
  findFeaturedPublishedArticles(): Promise<PublicPostListItem[]>
}

export interface TaxonomyReadRepository {
  listCategoriesWithCounts(): Promise<PublicCategory[]>
  findCategoryBySlug(slug: string): Promise<PublicCategoryRecord | null>
  listTagsWithCounts(): Promise<PublicTag[]>
  findTagBySlug(slug: string): Promise<PublicTagRecord | null>
}
