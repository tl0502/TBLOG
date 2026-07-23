import { sql } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { categories, comments, posts, tags } from '../database/schema'
import type { AdminContentCounts, AdminReadRepository } from './contracts/admin-read-repositories'

export function createAdminReadRepository(db: AppDatabase): AdminReadRepository {
  return {
    async getContentCounts(): Promise<AdminContentCounts> {
      // Keep all five metrics in one D1 statement. Besides removing serial latency, this budgets one
      // business query against the free-plan per-invocation query limit instead of five. The system
      // 未分类 category remains excluded so the metric reflects administrator-created categories.
      const [counts] = await db.select({
        publishedArticles: sql<number>`(
          select count(*) from ${posts}
          where ${posts.status} = ${'published'} and ${posts.type} = ${'article'}
        )`.mapWith(Number),
        drafts: sql<number>`(
          select count(*) from ${posts}
          where ${posts.status} = ${'draft'}
        )`.mapWith(Number),
        categories: sql<number>`(
          select count(*) from ${categories}
          where ${categories.isSystem} = 0
        )`.mapWith(Number),
        tags: sql<number>`(select count(*) from ${tags})`.mapWith(Number),
        pendingComments: sql<number>`(
          select count(*) from ${comments}
          where ${comments.status} = ${'pending'}
        )`.mapWith(Number)
      }).from(sql`(select 1)`)

      return {
        publishedArticles: counts?.publishedArticles ?? 0,
        drafts: counts?.drafts ?? 0,
        categories: counts?.categories ?? 0,
        tags: counts?.tags ?? 0,
        pendingComments: counts?.pendingComments ?? 0
      }
    }
  }
}
