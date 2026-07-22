import { and, desc, eq, isNotNull } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { posts } from '../database/schema'
import type { SearchRecord } from '../providers/search/search-provider'
import type { SearchResyncReadRepository } from './contracts/search-repositories'

interface ResyncRow {
  id: string
  slug: string
  title: string
  publishedAt: Date | null
  category: { slug: string; name: string } | null
  content: { excerpt: string | null; plainTextSearchBody: string | null } | null
  tags: { tag: { slug: string; name: string } }[]
}

// Read the corpus in pages rather than one unbounded query, so a large blog never materializes the
// entire posts join in a single DB round-trip. The full record array is still assembled (the
// SearchProvider replace contract takes an array), but the per-query working set stays bounded.
const PAGE_SIZE = 500

/**
 * Reads every published article as a `SearchRecord` for a full index rebuild. Only `type === 'article'`
 * rows with a `publishedAt` are included; drafts and page-type content are excluded. `body` falls back
 * to an empty string when the content row has no processed search text yet.
 */
export function createSearchResyncRepository(db: AppDatabase): SearchResyncReadRepository {
  return {
    async listAllPublishedSearchRecords() {
      const records: SearchRecord[] = []

      for (let offset = 0; ; offset += PAGE_SIZE) {
        const rows = (await db.query.posts.findMany({
          where: and(
            eq(posts.status, 'published'),
            eq(posts.type, 'article'),
            isNotNull(posts.publishedAt)
          ),
          orderBy: [desc(posts.publishedAt), desc(posts.id)],
          limit: PAGE_SIZE,
          offset,
          columns: { id: true, slug: true, title: true, publishedAt: true },
          with: {
            category: { columns: { slug: true, name: true } },
            content: { columns: { excerpt: true, plainTextSearchBody: true } },
            tags: { columns: {}, with: { tag: { columns: { slug: true, name: true } } } }
          }
        })) as ResyncRow[]

        for (const row of rows) {
          records.push({
            objectID: row.id,
            title: row.title,
            slug: row.slug,
            excerpt: row.content?.excerpt ?? null,
            body: row.content?.plainTextSearchBody ?? '',
            category: row.category ? { slug: row.category.slug, name: row.category.name } : null,
            tags: row.tags.map((entry) => ({ slug: entry.tag.slug, name: entry.tag.name })),
            publishedAt: (row.publishedAt as Date).getTime()
          })
        }

        if (rows.length < PAGE_SIZE) {
          break
        }
      }

      return records
    }
  }
}
