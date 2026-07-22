import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { categories, postTags, posts, tags } from '../database/schema'
import type {
  AdminCategory,
  AdminTag,
  AdminTaxonomyRepository,
  CreateCategoryInput,
  CreateTagInput,
  UpdateCategoryFields,
  UpdateTagFields
} from './contracts/admin-taxonomy-repositories'

interface AdminCategoryRow {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  sortOrder: number
  isSystem: boolean
  articleCount: number
}

function toAdminCategory(row: AdminCategoryRow): AdminCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
    sortOrder: row.sortOrder,
    isSystem: row.isSystem,
    articleCount: Number(row.articleCount)
  }
}

interface AdminTagRow {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  sortOrder: number
  articleCount: number
}

function toAdminTag(row: AdminTagRow): AdminTag {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
    sortOrder: row.sortOrder,
    articleCount: Number(row.articleCount)
  }
}

export function createAdminTaxonomyRepository(db: AppDatabase): AdminTaxonomyRepository {
  return {
    async listCategoryOptions() {
      return db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .orderBy(asc(categories.sortOrder), asc(categories.name))
    },

    async listTagOptions() {
      return db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .orderBy(asc(tags.sortOrder), asc(tags.name))
    },

    async listCategoriesWithCounts() {
      // Usage counts span every `article` post (draft + published) so admins see true usage.
      const rows = await db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          description: categories.description,
          color: categories.color,
          sortOrder: categories.sortOrder,
          isSystem: categories.isSystem,
          articleCount: count(posts.id)
        })
        .from(categories)
        .leftJoin(posts, and(eq(posts.categoryId, categories.id), eq(posts.type, 'article')))
        .groupBy(categories.id)
        .orderBy(asc(categories.sortOrder), asc(categories.name))

      return rows.map(toAdminCategory)
    },

    async findCategoryById(id) {
      const [row] = await db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          description: categories.description,
          color: categories.color,
          sortOrder: categories.sortOrder,
          isSystem: categories.isSystem,
          articleCount: count(posts.id)
        })
        .from(categories)
        .leftJoin(posts, and(eq(posts.categoryId, categories.id), eq(posts.type, 'article')))
        .where(eq(categories.id, id))
        .groupBy(categories.id)
        .limit(1)

      return row ? toAdminCategory(row) : null
    },

    async findCategoryBySlug(slug) {
      const row = await db.query.categories.findFirst({
        where: eq(categories.slug, slug),
        columns: { id: true }
      })
      return row ?? null
    },

    async listPublishedPostSlugsByCategoryId(id) {
      const rows = await db
        .select({ slug: posts.slug })
        .from(posts)
        .where(and(
          eq(posts.categoryId, id),
          eq(posts.type, 'article'),
          eq(posts.status, 'published')
        ))
      return rows.map((row) => row.slug)
    },

    async createCategory(input: CreateCategoryInput) {
      await db.insert(categories).values({
        id: input.id,
        name: input.name,
        slug: input.slug,
        description: input.description,
        color: input.color,
        sortOrder: input.sortOrder
      })
    },

    async updateCategory(id, fields: UpdateCategoryFields) {
      const set: Partial<typeof categories.$inferInsert> = { updatedAt: new Date() }
      if (fields.name !== undefined) set.name = fields.name
      if (fields.slug !== undefined) set.slug = fields.slug
      if (fields.description !== undefined) set.description = fields.description
      if (fields.color !== undefined) set.color = fields.color
      if (fields.sortOrder !== undefined) set.sortOrder = fields.sortOrder
      await db.update(categories).set(set).where(eq(categories.id, id))
    },

    async deleteCategoryReassigning(id, fallbackCategoryId) {
      // Reassign before delete so posts land on 未分类 rather than the FK's set-null fallback.
      await db.batch([
        db.update(posts).set({ categoryId: fallbackCategoryId }).where(eq(posts.categoryId, id)),
        db.delete(categories).where(eq(categories.id, id))
      ])
    },

    async listTagsWithCounts() {
      const rows = await db
        .select({
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
          description: tags.description,
          color: tags.color,
          sortOrder: tags.sortOrder,
          articleCount: count(posts.id)
        })
        .from(tags)
        .leftJoin(postTags, eq(postTags.tagId, tags.id))
        .leftJoin(posts, and(eq(posts.id, postTags.postId), eq(posts.type, 'article')))
        .groupBy(tags.id)
        .orderBy(asc(tags.sortOrder), asc(tags.name))

      return rows.map(toAdminTag)
    },

    async findTagById(id) {
      const [row] = await db
        .select({
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
          description: tags.description,
          color: tags.color,
          sortOrder: tags.sortOrder,
          articleCount: count(posts.id)
        })
        .from(tags)
        .leftJoin(postTags, eq(postTags.tagId, tags.id))
        .leftJoin(posts, and(eq(posts.id, postTags.postId), eq(posts.type, 'article')))
        .where(eq(tags.id, id))
        .groupBy(tags.id)
        .limit(1)

      return row ? toAdminTag(row) : null
    },

    async findTagBySlug(slug) {
      const row = await db.query.tags.findFirst({
        where: eq(tags.slug, slug),
        columns: { id: true }
      })
      return row ?? null
    },

    async listPublishedPostSlugsByTagIds(ids) {
      if (ids.length === 0) return []
      const rows = await db
        .selectDistinct({ slug: posts.slug })
        .from(posts)
        .innerJoin(postTags, eq(postTags.postId, posts.id))
        .where(and(
          inArray(postTags.tagId, ids),
          eq(posts.type, 'article'),
          eq(posts.status, 'published')
        ))
      return rows.map((row) => row.slug)
    },

    async createTag(input: CreateTagInput) {
      await db.insert(tags).values({
        id: input.id,
        name: input.name,
        slug: input.slug,
        description: input.description,
        color: input.color,
        sortOrder: input.sortOrder
      })
    },

    async updateTag(id, fields: UpdateTagFields) {
      const set: Partial<typeof tags.$inferInsert> = { updatedAt: new Date() }
      if (fields.name !== undefined) set.name = fields.name
      if (fields.slug !== undefined) set.slug = fields.slug
      if (fields.description !== undefined) set.description = fields.description
      if (fields.color !== undefined) set.color = fields.color
      if (fields.sortOrder !== undefined) set.sortOrder = fields.sortOrder
      await db.update(tags).set(set).where(eq(tags.id, id))
    },

    async deleteTag(id) {
      // post_tags rows cascade on the tag FK.
      await db.delete(tags).where(eq(tags.id, id))
    },

    async mergeTags(sourceId, targetId) {
      // Copy every current source relation inside the same atomic batch that deletes the source.
      // Keeping the INSERT as database-side SELECT avoids both an N+1 batch and a read/write race.
      const sourceRelations = db
        .select({
          postId: postTags.postId,
          tagId: sql<string>`${targetId}`.as('tag_id')
        })
        .from(postTags)
        .where(eq(postTags.tagId, sourceId))

      await db.batch([
        db.insert(postTags).select(sourceRelations).onConflictDoNothing(),
        db.delete(tags).where(eq(tags.id, sourceId))
      ])
    }
  }
}
