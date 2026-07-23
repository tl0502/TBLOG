import { z } from 'zod'
import { postStatusValues, postTypeValues } from '../domain/post'

// External image URL only (no upload); nullable so the client can clear the cover.
const coverSchema = z.string().trim().url().max(2048).nullable()
const slugSchema = z.string().trim().min(1).max(200)
const titleSchema = z.string().trim().min(1).max(200)
const customExcerptSchema = z.string().max(500).nullable()
const categoryIdSchema = z.string().min(1).nullable()
const tagIdsSchema = z.array(z.string().min(1)).max(50)
const nullableTrimmedText = (max: number) => z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(max).nullable()
)
const nullableAbsoluteHttpUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(2048).nullable().refine((value) => {
    if (value === null) return true
    try {
      const url = new URL(value)
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
    } catch {
      return false
    }
  }, 'Must be an absolute HTTP or HTTPS URL')
)
const nullableJsonLdOverride = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(50_000).nullable().refine((value) => {
    if (value === null) return true
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    } catch {
      return false
    }
  }, 'Must be a valid JSON object')
)

const postSeoFields = {
  seoTitle: nullableTrimmedText(200).optional(),
  seoDescription: nullableTrimmedText(500).optional(),
  canonicalUrlOverride: nullableAbsoluteHttpUrl.optional(),
  openGraphImageUrl: nullableAbsoluteHttpUrl.optional(),
  twitterImageUrl: nullableAbsoluteHttpUrl.optional(),
  jsonLdOverrideJson: nullableJsonLdOverride.optional()
}

export const createPostInputSchema = z.object({
  type: z.enum(postTypeValues),
  title: titleSchema,
  slug: slugSchema.optional(),
  categoryId: categoryIdSchema.optional(),
  cover: coverSchema.optional(),
  customExcerpt: customExcerptSchema.optional(),
  markdown: z.string().optional(),
  tagIds: tagIdsSchema.optional(),
  ...postSeoFields
})

export const updatePostInputSchema = z
  .object({
    title: titleSchema.optional(),
    slug: slugSchema.optional(),
    categoryId: categoryIdSchema.optional(),
    cover: coverSchema.optional(),
    customExcerpt: customExcerptSchema.optional(),
    markdown: z.string().optional(),
    tagIds: tagIdsSchema.optional(),
    status: z.enum(postStatusValues).optional(),
    featured: z.boolean().optional(),
    ...postSeoFields
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  })

export const previewInputSchema = z.object({
  markdown: z.string()
})

export const postIdParamSchema = z.string().trim().min(1)

export const postSlugParamSchema = z.string().trim().min(1).max(200)

// Post-list query. Pagination and filters come from the URL, so every field tolerates junk: a bad
// offset/limit falls back to its default and an unknown status/blank filter is simply dropped rather
// than failing the whole list request. `limit` is capped so a caller can't request an unbounded page.
// `slug` is an exact match (singleton lookup like About); `search` is a substring on title/slug.
export const postListQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).catch(0),
  limit: z.coerce.number().int().min(1).max(100).catch(25),
  search: z.string().trim().min(1).max(200).optional().catch(undefined),
  status: z.enum(postStatusValues).optional().catch(undefined),
  tagId: z.string().trim().min(1).optional().catch(undefined),
  slug: z.string().trim().min(1).max(200).optional().catch(undefined)
})

export type CreatePostInputDto = z.infer<typeof createPostInputSchema>
export type UpdatePostInputDto = z.infer<typeof updatePostInputSchema>
export type PreviewInputDto = z.infer<typeof previewInputSchema>
export type PostListQueryDto = z.infer<typeof postListQuerySchema>
