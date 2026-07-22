import { z } from 'zod'

const nameSchema = z.string().trim().min(1).max(100)
const slugSchema = z.string().trim().min(1).max(200)
const descriptionSchema = z.string().trim().max(500).nullable()
const colorSchema = z.string().trim().max(32).nullable()
const sortOrderSchema = z.number().int().min(0).max(1_000_000)

export const createCategoryInputSchema = z.object({
  name: nameSchema,
  slug: slugSchema.optional(),
  description: descriptionSchema.optional(),
  color: colorSchema.optional(),
  sortOrder: sortOrderSchema.optional()
})

export const updateCategoryInputSchema = z
  .object({
    name: nameSchema.optional(),
    slug: slugSchema.optional(),
    description: descriptionSchema.optional(),
    color: colorSchema.optional(),
    sortOrder: sortOrderSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  })

export const createTagInputSchema = z.object({
  name: nameSchema,
  slug: slugSchema.optional(),
  description: descriptionSchema.optional(),
  color: colorSchema.optional(),
  sortOrder: sortOrderSchema.optional()
})

export const updateTagInputSchema = z
  .object({
    name: nameSchema.optional(),
    slug: slugSchema.optional(),
    description: descriptionSchema.optional(),
    color: colorSchema.optional(),
    sortOrder: sortOrderSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  })

export const mergeTagsInputSchema = z
  .object({
    sourceId: z.string().trim().min(1),
    targetId: z.string().trim().min(1)
  })
  .refine((value) => value.sourceId !== value.targetId, {
    message: 'Cannot merge a tag into itself'
  })

export const taxonomyIdParamSchema = z.string().trim().min(1)

export type CreateCategoryInputDto = z.infer<typeof createCategoryInputSchema>
export type UpdateCategoryInputDto = z.infer<typeof updateCategoryInputSchema>
export type CreateTagInputDto = z.infer<typeof createTagInputSchema>
export type UpdateTagInputDto = z.infer<typeof updateTagInputSchema>
export type MergeTagsInputDto = z.infer<typeof mergeTagsInputSchema>
