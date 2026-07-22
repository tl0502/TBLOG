export interface AdminTaxonomyOption {
  id: string
  name: string
}

export interface AdminTaxonomyOptions {
  categories: AdminTaxonomyOption[]
  tags: AdminTaxonomyOption[]
}

export interface AdminCategory {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  sortOrder: number
  isSystem: boolean
  articleCount: number
}

export interface CreateCategoryInput {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  sortOrder: number
}

export interface UpdateCategoryFields {
  name?: string
  slug?: string
  description?: string | null
  color?: string | null
  sortOrder?: number
}

export interface AdminTag {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  sortOrder: number
  articleCount: number
}

export interface CreateTagInput {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  sortOrder: number
}

export interface UpdateTagFields {
  name?: string
  slug?: string
  description?: string | null
  color?: string | null
  sortOrder?: number
}

export interface AdminTaxonomyRepository {
  listCategoryOptions(): Promise<AdminTaxonomyOption[]>
  listTagOptions(): Promise<AdminTaxonomyOption[]>

  // Category management (Phase 10). Counts are usage across all `article` posts.
  listCategoriesWithCounts(): Promise<AdminCategory[]>
  findCategoryById(id: string): Promise<AdminCategory | null>
  findCategoryBySlug(slug: string): Promise<{ id: string } | null>
  listPublishedPostSlugsByCategoryId(id: string): Promise<string[]>
  createCategory(input: CreateCategoryInput): Promise<void>
  updateCategory(id: string, fields: UpdateCategoryFields): Promise<void>
  /** Reassign the category's posts to `fallbackCategoryId`, then delete it — atomically (`db.batch`). */
  deleteCategoryReassigning(id: string, fallbackCategoryId: string): Promise<void>

  // Tag management (Phase 10).
  listTagsWithCounts(): Promise<AdminTag[]>
  findTagById(id: string): Promise<AdminTag | null>
  findTagBySlug(slug: string): Promise<{ id: string } | null>
  listPublishedPostSlugsByTagIds(ids: string[]): Promise<string[]>
  createTag(input: CreateTagInput): Promise<void>
  updateTag(id: string, fields: UpdateTagFields): Promise<void>
  deleteTag(id: string): Promise<void>
  /** Move source's post relations onto target (dedup via composite PK), then delete source — atomically. */
  mergeTags(sourceId: string, targetId: string): Promise<void>
}
