import { and, count, eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { categories, comments, posts, tags } from '../database/schema'
import type { AdminContentCounts, AdminReadRepository } from './contracts/admin-read-repositories'

export function createAdminReadRepository(db: AppDatabase): AdminReadRepository {
  return {
    async getContentCounts(): Promise<AdminContentCounts> {
      const [published] = await db
        .select({ value: count() })
        .from(posts)
        .where(and(eq(posts.status, 'published'), eq(posts.type, 'article')))

      const [drafts] = await db
        .select({ value: count() })
        .from(posts)
        .where(eq(posts.status, 'draft'))

      // Exclude the system 未分类 category so the metric reflects admin-created categories.
      const [categoryCount] = await db
        .select({ value: count() })
        .from(categories)
        .where(eq(categories.isSystem, false))
      const [tagCount] = await db.select({ value: count() }).from(tags)
      const [pendingCommentCount] = await db
        .select({ value: count() })
        .from(comments)
        .where(eq(comments.status, 'pending'))

      return {
        publishedArticles: Number(published?.value ?? 0),
        drafts: Number(drafts?.value ?? 0),
        categories: Number(categoryCount?.value ?? 0),
        tags: Number(tagCount?.value ?? 0),
        pendingComments: Number(pendingCommentCount?.value ?? 0)
      }
    }
  }
}
