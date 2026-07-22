import { and, asc, count, eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { categories, postTags, posts, tags } from '../database/schema'
import type {
  PublicCategory,
  PublicCategoryRecord,
  TaxonomyReadRepository
} from './contracts/public-read-repositories'

interface TaxonomyRow {
  id?: string
  slug: string
  name: string
  description: string | null
  color: string | null
  articleCount: number
}

function toTaxonomy(row: TaxonomyRow): PublicCategory {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    color: row.color,
    articleCount: Number(row.articleCount)
  }
}

function toTaxonomyRecord(row: TaxonomyRow & { id: string }): PublicCategoryRecord {
  return { id: row.id, ...toTaxonomy(row) }
}

export function createTaxonomyReadRepository(db: AppDatabase): TaxonomyReadRepository {
  return {
    async listCategoriesWithCounts() {
      const rows = await db
        .select({
          slug: categories.slug,
          name: categories.name,
          description: categories.description,
          color: categories.color,
          articleCount: count(posts.id)
        })
        .from(categories)
        .leftJoin(
          posts,
          and(
            eq(posts.categoryId, categories.id),
            eq(posts.status, 'published'),
            eq(posts.type, 'article')
          )
        )
        .groupBy(categories.id)
        .orderBy(asc(categories.sortOrder), asc(categories.name))

      return rows.map(toTaxonomy)
    },

    async findCategoryBySlug(slug) {
      const [row] = await db
        .select({
          id: categories.id,
          slug: categories.slug,
          name: categories.name,
          description: categories.description,
          color: categories.color,
          articleCount: count(posts.id)
        })
        .from(categories)
        .leftJoin(
          posts,
          and(
            eq(posts.categoryId, categories.id),
            eq(posts.status, 'published'),
            eq(posts.type, 'article')
          )
        )
        .where(eq(categories.slug, slug))
        .groupBy(categories.id)
        .limit(1)

      return row ? toTaxonomyRecord(row) : null
    },

    async listTagsWithCounts() {
      const rows = await db
        .select({
          slug: tags.slug,
          name: tags.name,
          description: tags.description,
          color: tags.color,
          articleCount: count(posts.id)
        })
        .from(tags)
        .leftJoin(postTags, eq(postTags.tagId, tags.id))
        .leftJoin(
          posts,
          and(
            eq(posts.id, postTags.postId),
            eq(posts.status, 'published'),
            eq(posts.type, 'article')
          )
        )
        .groupBy(tags.id)
        .orderBy(asc(tags.sortOrder), asc(tags.name))

      return rows.map(toTaxonomy)
    },

    async findTagBySlug(slug) {
      const [row] = await db
        .select({
          id: tags.id,
          slug: tags.slug,
          name: tags.name,
          description: tags.description,
          color: tags.color,
          articleCount: count(posts.id)
        })
        .from(tags)
        .leftJoin(postTags, eq(postTags.tagId, tags.id))
        .leftJoin(
          posts,
          and(
            eq(posts.id, postTags.postId),
            eq(posts.status, 'published'),
            eq(posts.type, 'article')
          )
        )
        .where(eq(tags.slug, slug))
        .groupBy(tags.id)
        .limit(1)

      return row ? toTaxonomyRecord(row) : null
    }
  }
}
