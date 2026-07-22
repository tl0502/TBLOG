import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { posts } from '../database/schema'
import type { SearchRecord } from '../providers/search/search-provider'
import type { SearchIndexReadRepository } from './contracts/search-repositories'

/**
 * Reads the rich record an index needs (taxonomy slugs/names, plain-text body) straight from D1.
 * Only a published, indexable article (type `article`) yields a record; drafts, page-type content,
 * and unpublished posts return `null` so callers skip indexing.
 */
export function createSearchIndexReadRepository(db: AppDatabase): SearchIndexReadRepository {
  return {
    async getSearchRecord(postId: string): Promise<SearchRecord | null> {
      const row = (await db.query.posts.findFirst({
        where: eq(posts.id, postId),
        columns: { id: true, title: true, slug: true, type: true, status: true, publishedAt: true },
        with: {
          category: { columns: { slug: true, name: true } },
          content: { columns: { excerpt: true, plainTextSearchBody: true } },
          tags: { columns: {}, with: { tag: { columns: { slug: true, name: true } } } }
        }
      })) as
        | {
            id: string
            title: string
            slug: string
            type: 'article' | 'page'
            status: 'draft' | 'published'
            publishedAt: Date | null
            category: { slug: string; name: string } | null
            content: { excerpt: string | null; plainTextSearchBody: string | null } | null
            tags: { tag: { slug: string; name: string } }[]
          }
        | undefined

      // Only published, indexable articles ever become a record.
      if (!row || row.type !== 'article' || row.status !== 'published' || !row.publishedAt) {
        return null
      }

      return {
        objectID: row.id,
        title: row.title,
        slug: row.slug,
        excerpt: row.content?.excerpt ?? null,
        body: row.content?.plainTextSearchBody ?? '',
        category: row.category ? { slug: row.category.slug, name: row.category.name } : null,
        tags: row.tags.map((entry) => ({ slug: entry.tag.slug, name: entry.tag.name })),
        publishedAt: row.publishedAt.getTime()
      }
    }
  }
}
