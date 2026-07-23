import { and, count, desc, eq, exists, or, sql, type SQL } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { postMetadata, postTags, posts } from '../database/schema'
import type {
  AdminPostEdit,
  AdminPostListPage,
  AdminPostListQuery,
  AdminPostRepository,
  CreatePostInput,
  UpdatePostFields,
  UpdatePostSeoMetadata
} from './contracts/admin-write-repositories'

// Escape the LIKE metacharacters a user might type so a search for "50%" or "a_b" matches literally
// rather than as wildcards. Paired with `ESCAPE '\'` on the predicate below.
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`)
}

export function createAdminPostRepository(db: AppDatabase): AdminPostRepository {
  return {
    async listPosts(query: AdminPostListQuery): Promise<AdminPostListPage> {
      const conditions: Array<SQL | undefined> = []
      if (query.status) {
        conditions.push(eq(posts.status, query.status))
      }
      if (query.slug) {
        conditions.push(eq(posts.slug, query.slug))
      }
      if (query.search) {
        const pattern = `%${escapeLike(query.search)}%`
        conditions.push(or(
          sql`${posts.title} LIKE ${pattern} ESCAPE '\\'`,
          sql`${posts.slug} LIKE ${pattern} ESCAPE '\\'`
        ))
      }
      if (query.tagId) {
        // Correlated EXISTS keeps tag membership to a single bound parameter (the tag id) and one
        // statement — no per-row tag lookup and no unbounded id list that could exceed D1's limit.
        conditions.push(exists(
          db
            .select({ postId: postTags.postId })
            .from(postTags)
            .where(and(eq(postTags.postId, posts.id), eq(postTags.tagId, query.tagId)))
        ))
      }
      const where = and(...conditions)

      // Two statements per invocation: the total (for the pager) and the windowed page. Both stay
      // well within the free-plan per-invocation query budget regardless of table size.
      const totalRows = await db.select({ value: count() }).from(posts).where(where)
      const total = totalRows[0]?.value ?? 0

      const rows = await db.query.posts.findMany({
        columns: {
          id: true,
          title: true,
          slug: true,
          type: true,
          status: true,
          isFeatured: true,
          featuredOrder: true,
          updatedAt: true,
          publishedAt: true,
          categoryId: true
        },
        with: {
          tags: { columns: { tagId: true } }
        },
        where,
        orderBy: [desc(posts.updatedAt), desc(posts.id)],
        limit: query.limit,
        offset: query.offset
      })
      const items = rows.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        type: row.type,
        status: row.status,
        featured: row.isFeatured,
        featuredOrder: row.featuredOrder,
        updatedAt: row.updatedAt,
        publishedAt: row.publishedAt,
        categoryId: row.categoryId,
        tagIds: row.tags.map((tag) => tag.tagId)
      }))
      return { items, total }
    },

    async findForEdit(id): Promise<AdminPostEdit | null> {
      const row = await db.query.posts.findFirst({
        where: eq(posts.id, id),
        columns: {
          id: true,
          title: true,
          slug: true,
          type: true,
          status: true,
          isFeatured: true,
          featuredOrder: true,
          updatedAt: true,
          publishedAt: true,
          categoryId: true,
          cover: true
        },
        with: {
          content: { columns: { markdown: true, customExcerpt: true, processingState: true, processingError: true } },
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
          tags: { columns: { tagId: true } }
        }
      })
      if (!row) {
        return null
      }
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        type: row.type,
        status: row.status,
        featured: row.isFeatured,
        featuredOrder: row.featuredOrder,
        updatedAt: row.updatedAt,
        publishedAt: row.publishedAt,
        categoryId: row.categoryId,
        cover: row.cover,
        markdown: row.content?.markdown ?? '',
        customExcerpt: row.content?.customExcerpt ?? null,
        seoTitle: row.metadata?.seoTitle ?? null,
        seoDescription: row.metadata?.seoDescription ?? null,
        canonicalUrlOverride: row.metadata?.canonicalUrlOverride ?? null,
        openGraphImageUrl: row.metadata?.openGraphImageUrl ?? null,
        twitterImageUrl: row.metadata?.twitterImageUrl ?? null,
        jsonLdOverrideJson: row.metadata?.jsonLdOverrideJson ?? null,
        tagIds: row.tags.map((tag) => tag.tagId),
        processingState: row.content?.processingState ?? 'pending',
        processingError: row.content?.processingError ?? null
      }
    },

    async createPost(input: CreatePostInput) {
      await db.insert(posts).values({
        id: input.id,
        type: input.type,
        status: 'draft',
        title: input.title,
        slug: input.slug,
        authorId: input.authorId,
        categoryId: input.categoryId,
        cover: input.cover
      })
    },

    async updatePostFields(id, fields: UpdatePostFields) {
      const set: Partial<typeof posts.$inferInsert> = { updatedAt: new Date() }
      if (fields.title !== undefined) set.title = fields.title
      if (fields.slug !== undefined) set.slug = fields.slug
      if (fields.categoryId !== undefined) set.categoryId = fields.categoryId
      if (fields.cover !== undefined) set.cover = fields.cover
      await db.update(posts).set(set).where(eq(posts.id, id))
    },

    async upsertSeoMetadata(postId, fields: UpdatePostSeoMetadata) {
      const values = {
        postId,
        seoTitle: fields.seoTitle ?? null,
        seoDescription: fields.seoDescription ?? null,
        canonicalUrlOverride: fields.canonicalUrlOverride ?? null,
        openGraphImageUrl: fields.openGraphImageUrl ?? null,
        twitterImageUrl: fields.twitterImageUrl ?? null,
        jsonLdOverrideJson: fields.jsonLdOverrideJson ?? null
      }
      const set: Partial<typeof postMetadata.$inferInsert> = {}
      if (fields.seoTitle !== undefined) set.seoTitle = fields.seoTitle
      if (fields.seoDescription !== undefined) set.seoDescription = fields.seoDescription
      if (fields.canonicalUrlOverride !== undefined) set.canonicalUrlOverride = fields.canonicalUrlOverride
      if (fields.openGraphImageUrl !== undefined) set.openGraphImageUrl = fields.openGraphImageUrl
      if (fields.twitterImageUrl !== undefined) set.twitterImageUrl = fields.twitterImageUrl
      if (fields.jsonLdOverrideJson !== undefined) set.jsonLdOverrideJson = fields.jsonLdOverrideJson
      await db
        .insert(postMetadata)
        .values(values)
        .onConflictDoUpdate({ target: postMetadata.postId, set })
    },

    async setStatus(id, status, publishedAt) {
      const [row] = await db
        .update(posts)
        .set({
          status,
          publishedAt,
          updatedAt: new Date(),
          ...(status === 'draft' ? { isFeatured: false } : {})
        })
        .where(eq(posts.id, id))
        .returning({ slug: posts.slug, categoryId: posts.categoryId })
      return row ?? null
    },

    async setFeatured(id, featured) {
      if (!featured) {
        await db.update(posts).set({ isFeatured: false }).where(eq(posts.id, id))
        return
      }

      await db.update(posts).set({ isFeatured: true }).where(eq(posts.id, id))
    },

    async setTags(postId, tagIds) {
      const removeExisting = db.delete(postTags).where(eq(postTags.postId, postId))
      if (!tagIds.length) {
        await removeExisting
        return
      }

      await db.batch([
        removeExisting,
        db.insert(postTags).values(tagIds.map((tagId) => ({ postId, tagId })))
      ])
    },

    async deletePost(id) {
      const existing = await db.query.posts.findFirst({
        where: eq(posts.id, id),
        columns: { slug: true, status: true }
      })
      if (!existing) {
        return null
      }
      // Post content, metadata, and tags cascade on the posts FK (enforced by D1 and the test DB).
      await db.delete(posts).where(eq(posts.id, id))
      return { slug: existing.slug, status: existing.status }
    },

    async findBySlug(slug) {
      const row = await db.query.posts.findFirst({
        where: eq(posts.slug, slug),
        columns: { id: true }
      })
      return row ?? null
    }
  }
}
