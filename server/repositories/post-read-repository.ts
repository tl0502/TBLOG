import { and, asc, count, desc, eq, exists, inArray, isNotNull, lt, or, type SQL } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { categories, postTags, posts, tags } from '../database/schema'
import { decodeCursor, encodeCursor } from '../utils/cursor'
import type {
  ArchiveGroup,
  FeedPostRef,
  FeaturedPostReadRepository,
  HotspotPostReadRepository,
  PostReadRepository,
  PublicHomeFeedPage,
  PublicHomeFeedQuery,
  PublicListPage,
  PublicListQuery,
  PublicPostListItem
} from './contracts/public-read-repositories'
import type { AnalyticsReportArticleRepository } from './contracts/analytics-report-repositories'

interface ListRow {
  id: string
  slug: string
  title: string
  cover: string | null
  publishedAt: Date | null
  category: { slug: string; name: string } | null
  content: { excerpt: string | null; readingTime: number } | null
  tags: { tag: { slug: string; name: string } }[]
}

const listColumns = { id: true, slug: true, title: true, cover: true, publishedAt: true } as const
const listWith = {
  category: { columns: { slug: true, name: true } },
  content: { columns: { excerpt: true, readingTime: true } },
  tags: { columns: {}, with: { tag: { columns: { slug: true, name: true } } } }
} as const

// Cloudflare D1 accepts at most 100 bound parameters per query. Leave headroom for
// future predicates added alongside the ID list.
const PUBLIC_POST_QUERY_BATCH_SIZE = 80

function toListItem(row: ListRow): PublicPostListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    cover: row.cover,
    excerpt: row.content?.excerpt ?? null,
    readingTime: row.content?.readingTime ?? 0,
    publishedAt: row.publishedAt as Date,
    category: row.category ? { slug: row.category.slug, name: row.category.name } : null,
    tags: row.tags.map((entry) => ({ slug: entry.tag.slug, name: entry.tag.name }))
  }
}

async function hydrateListItems(db: AppDatabase, ids: string[]): Promise<PublicPostListItem[]> {
  if (!ids.length) return []
  const uniqueIds = [...new Set(ids)]
  const rows: ListRow[] = []
  for (let offset = 0; offset < uniqueIds.length; offset += PUBLIC_POST_QUERY_BATCH_SIZE) {
    rows.push(...await db.query.posts.findMany({
      where: and(
        inArray(posts.id, uniqueIds.slice(offset, offset + PUBLIC_POST_QUERY_BATCH_SIZE)),
        eq(posts.status, 'published'),
        eq(posts.type, 'article'),
        isNotNull(posts.publishedAt)
      ),
      columns: listColumns,
      with: listWith
    }) as ListRow[])
  }
  const byId = new Map(rows.map((row) => [row.id, toListItem(row)]))
  return ids.flatMap((id) => {
    const item = byId.get(id)
    return item ? [item] : []
  })
}

const emptyPage: PublicListPage<PublicPostListItem> = { items: [], nextCursor: null }

export function createPostReadRepository(
  db: AppDatabase
): PostReadRepository & FeaturedPostReadRepository & HotspotPostReadRepository & AnalyticsReportArticleRepository {
  async function listHomeArticles(
    query: PublicHomeFeedQuery
  ): Promise<PublicHomeFeedPage<PublicPostListItem>> {
    const publishedArticle = and(
      eq(posts.status, 'published'),
      eq(posts.type, 'article'),
      isNotNull(posts.publishedAt)
    )
    const direction = query.order === 'asc' ? asc : desc
    const totalRows = await db.select({ total: count() }).from(posts).where(publishedArticle)
    const total = totalRows[0]?.total ?? 0
    const pageCount = Math.ceil(total / query.limit)
    const page = pageCount > 0 ? Math.min(query.page, pageCount) : 1
    const offset = (page - 1) * query.limit

    const orderBy = query.sort === 'updatedAt'
      ? [direction(posts.updatedAt), desc(posts.publishedAt), desc(posts.id)]
      : [direction(posts.publishedAt), desc(posts.updatedAt), desc(posts.id)]
    const ranked = await db.select({ id: posts.id })
      .from(posts)
      .where(publishedArticle)
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(offset)

    return {
      items: await hydrateListItems(db, ranked.map((row) => row.id)),
      page,
      pageSize: query.limit,
      total,
      pageCount,
      sort: query.sort,
      order: query.order
    }
  }

  async function queryArticleList(
    extra: SQL[],
    query: PublicListQuery
  ): Promise<PublicListPage<PublicPostListItem>> {
    const conditions: SQL[] = [
      eq(posts.status, 'published'),
      eq(posts.type, 'article'),
      isNotNull(posts.publishedAt),
      ...extra
    ]

    const decoded = query.cursor ? decodeCursor(query.cursor) : null
    if (decoded) {
      const cursorDate = new Date(decoded.publishedAtMs)
      const keyset = or(
        lt(posts.publishedAt, cursorDate),
        and(eq(posts.publishedAt, cursorDate), lt(posts.id, decoded.id))
      )
      if (keyset) {
        conditions.push(keyset)
      }
    }

    const rows = (await db.query.posts.findMany({
      where: and(...conditions),
      orderBy: [desc(posts.publishedAt), desc(posts.id)],
      limit: query.limit + 1,
      columns: listColumns,
      with: listWith
    })) as ListRow[]

    const hasMore = rows.length > query.limit
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map(toListItem)
    const last = items[items.length - 1]
    const nextCursor =
      hasMore && last ? encodeCursor({ publishedAtMs: last.publishedAt.getTime(), id: last.id }) : null

    return { items, nextCursor }
  }

  return {
    listHomeArticles,

    listPublishedArticlesByIds(ids) {
      return hydrateListItems(db, [...new Set(ids)])
    },

    async listPublishedArticleIds() {
      const rows = await db.select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.status, 'published'), eq(posts.type, 'article'), isNotNull(posts.publishedAt)))
      return rows.map((row) => row.id)
    },

    async listAllPublishedAnalyticsArticles() {
      const rows = await db.select({ id: posts.id, slug: posts.slug, publishedAt: posts.publishedAt })
        .from(posts)
        .where(and(eq(posts.status, 'published'), eq(posts.type, 'article'), isNotNull(posts.publishedAt)))
        .orderBy(desc(posts.publishedAt), desc(posts.id))
      return rows.flatMap((row) => row.publishedAt
        ? [{ id: row.id, slug: row.slug, publishedAt: row.publishedAt }]
        : [])
    },

    listPublishedArticles(query) {
      return queryArticleList([], query)
    },

    async listPublishedArticlesBySlugs(slugs) {
      const uniqueSlugs = [...new Set(slugs)]
      if (!uniqueSlugs.length) return []

      const rows: ListRow[] = []
      for (let offset = 0; offset < uniqueSlugs.length; offset += PUBLIC_POST_QUERY_BATCH_SIZE) {
        rows.push(...await db.query.posts.findMany({
          where: and(
            inArray(posts.slug, uniqueSlugs.slice(offset, offset + PUBLIC_POST_QUERY_BATCH_SIZE)),
            eq(posts.status, 'published'),
            eq(posts.type, 'article'),
            isNotNull(posts.publishedAt)
          ),
          columns: listColumns,
          with: listWith
        }) as ListRow[])
      }
      const bySlug = new Map(rows.map((row) => [row.slug, toListItem(row)]))

      return uniqueSlugs.flatMap((slug) => {
        const article = bySlug.get(slug)
        return article ? [article] : []
      })
    },

    async findFeaturedPublishedArticles() {
      const rows = (await db.query.posts.findMany({
        where: and(
          eq(posts.isFeatured, true),
          eq(posts.status, 'published'),
          eq(posts.type, 'article'),
          isNotNull(posts.publishedAt)
        ),
        orderBy: [desc(posts.featuredOrder), desc(posts.publishedAt), desc(posts.id)],
        columns: listColumns,
        with: listWith
      })) as ListRow[]

      return rows.filter((row) => row.publishedAt).map(toListItem)
    },

    async findPublishedDetailBySlug(slug) {
      const row = (await db.query.posts.findFirst({
        where: and(eq(posts.slug, slug), eq(posts.status, 'published')),
        columns: {
          id: true,
          slug: true,
          title: true,
          type: true,
          cover: true,
          publishedAt: true,
          updatedAt: true
        },
        with: {
          category: { columns: { slug: true, name: true } },
          content: {
            columns: { excerpt: true, readingTime: true, html: true, tocJson: true, codeMetaJson: true }
          },
          metadata: {
            columns: {
              seoTitle: true,
              seoDescription: true,
              canonicalUrlOverride: true,
              openGraphImageUrl: true,
              twitterImageUrl: true,
              jsonLdOverrideJson: true
            }
          },
          tags: { columns: {}, with: { tag: { columns: { slug: true, name: true } } } }
        }
      })) as
        | (ListRow & {
            type: 'article' | 'page'
            updatedAt: Date
            content:
              | (ListRow['content'] & {
                  html: string | null
                  tocJson: string | null
                  codeMetaJson: string | null
                })
              | null
            metadata:
              | {
                  seoTitle: string | null
                  seoDescription: string | null
                  canonicalUrlOverride: string | null
                  openGraphImageUrl: string | null
                  twitterImageUrl: string | null
                  jsonLdOverrideJson: string | null
                }
              | null
          })
        | undefined

      if (!row || !row.publishedAt) {
        return null
      }

      return {
        ...toListItem(row),
        type: row.type,
        updatedAt: row.updatedAt,
        html: row.content?.html ?? '',
        tocJson: row.content?.tocJson ?? null,
        codeMetaJson: row.content?.codeMetaJson ?? null,
        seoTitle: row.metadata?.seoTitle ?? null,
        seoDescription: row.metadata?.seoDescription ?? null,
        canonicalUrlOverride: row.metadata?.canonicalUrlOverride ?? null,
        openGraphImageUrl: row.metadata?.openGraphImageUrl ?? null,
        twitterImageUrl: row.metadata?.twitterImageUrl ?? null,
        jsonLdOverrideJson: row.metadata?.jsonLdOverrideJson ?? null
      }
    },

    async listPublishedArticlesByCategorySlug(slug, query) {
      const category = await db.query.categories.findFirst({
        where: eq(categories.slug, slug),
        columns: { id: true }
      })
      if (!category) {
        return emptyPage
      }
      return queryArticleList([eq(posts.categoryId, category.id)], query)
    },

    async listPublishedArticlesByTagSlug(slug, query) {
      const tag = await db.query.tags.findFirst({ where: eq(tags.slug, slug), columns: { id: true } })
      if (!tag) {
        return emptyPage
      }

      // Correlated EXISTS keeps tag membership as a single bound parameter (the tag id).
      // Fetching every post id and using `inArray` would scale bound parameters with the
      // tag size and can exceed D1's per-query parameter limit for popular tags.
      const hasTag = exists(
        db
          .select({ postId: postTags.postId })
          .from(postTags)
          .where(and(eq(postTags.postId, posts.id), eq(postTags.tagId, tag.id)))
      )

      return queryArticleList([hasTag], query)
    },

    async listArchive() {
      const rows = (await db.query.posts.findMany({
        where: and(
          eq(posts.status, 'published'),
          eq(posts.type, 'article'),
          isNotNull(posts.publishedAt)
        ),
        orderBy: [desc(posts.publishedAt), desc(posts.id)],
        columns: listColumns,
        with: listWith
      })) as ListRow[]

      const groups: ArchiveGroup[] = []
      const index = new Map<string, ArchiveGroup>()

      for (const row of rows) {
        const item = toListItem(row)
        const year = item.publishedAt.getUTCFullYear()
        const month = item.publishedAt.getUTCMonth() + 1
        const key = `${year}-${month}`

        let group = index.get(key)
        if (!group) {
          group = { year, month, items: [] }
          index.set(key, group)
          groups.push(group)
        }
        group.items.push(item)
      }

      return groups
    },

    async listFeedPosts() {
      // Articles and pages, newest first. Pages (e.g. About) are needed for the sitemap; the RSS
      // feed filters to articles in the service. Only minimal columns — feeds never read stored HTML.
      const rows = (await db.query.posts.findMany({
        where: and(eq(posts.status, 'published'), isNotNull(posts.publishedAt)),
        orderBy: [desc(posts.publishedAt), desc(posts.id)],
        columns: { slug: true, title: true, type: true, publishedAt: true, updatedAt: true },
        with: { content: { columns: { excerpt: true } } }
      })) as {
        slug: string
        title: string
        type: 'article' | 'page'
        publishedAt: Date | null
        updatedAt: Date
        content: { excerpt: string | null } | null
      }[]

      const feed: FeedPostRef[] = []
      for (const row of rows) {
        if (!row.publishedAt) {
          continue
        }
        feed.push({
          slug: row.slug,
          title: row.title,
          excerpt: row.content?.excerpt ?? null,
          type: row.type,
          publishedAt: row.publishedAt,
          updatedAt: row.updatedAt
        })
      }
      return feed
    }
  }
}
