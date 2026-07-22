import { and, desc, eq, gte, inArray, isNotNull, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { postTags, posts } from '../database/schema'
import type { HomeRailReadRepository } from './contracts/home-rail-repositories'

const D1_SAFE_IN_QUERY_BATCH_SIZE = 80

export function createHomeRailReadRepository(db: AppDatabase): HomeRailReadRepository {
  const publishedArticle = and(
    eq(posts.status, 'published'),
    eq(posts.type, 'article'),
    isNotNull(posts.publishedAt)
  )

  return {
    async getContentCounts() {
      const [articleRows, categoryRows, tagRows] = await Promise.all([
        db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(posts).where(publishedArticle),
        db.select({ count: sql<number>`count(distinct ${posts.categoryId})`.mapWith(Number) }).from(posts)
          .where(and(publishedArticle, isNotNull(posts.categoryId))),
        db.select({ count: sql<number>`count(distinct ${postTags.tagId})`.mapWith(Number) }).from(postTags)
          .innerJoin(posts, eq(postTags.postId, posts.id)).where(publishedArticle)
      ])
      return {
        articles: articleRows[0]?.count ?? 0,
        categories: categoryRows[0]?.count ?? 0,
        tags: tagRows[0]?.count ?? 0
      }
    },

    async getLastPublicUpdate() {
      const rows = await db.select({ updatedAt: posts.updatedAt }).from(posts)
        .where(publishedArticle).orderBy(desc(posts.updatedAt)).limit(1)
      return rows[0]?.updatedAt ?? null
    },

    async listArticleSignals(since, limit) {
      const recent = or(gte(posts.publishedAt, since), gte(posts.updatedAt, since))
      if (!recent) return []
      const rows = await db.select({
        slug: posts.slug,
        title: posts.title,
        publishedAt: posts.publishedAt,
        updatedAt: posts.updatedAt
      }).from(posts).where(and(publishedArticle, recent)).orderBy(desc(posts.updatedAt)).limit(limit)
      return rows.flatMap((row) => row.publishedAt ? [{ ...row, publishedAt: row.publishedAt }] : [])
    },

    async listPublishedArticleSlugs(slugs) {
      if (!slugs.length) return []
      const uniqueSlugs = [...new Set(slugs)]
      const published = new Set<string>()
      for (let offset = 0; offset < uniqueSlugs.length; offset += D1_SAFE_IN_QUERY_BATCH_SIZE) {
        const rows = await db.select({ slug: posts.slug }).from(posts)
          .where(and(
            publishedArticle,
            inArray(posts.slug, uniqueSlugs.slice(offset, offset + D1_SAFE_IN_QUERY_BATCH_SIZE))
          ))
        for (const row of rows) published.add(row.slug)
      }
      return uniqueSlugs.filter((slug) => published.has(slug))
    }
  }
}
