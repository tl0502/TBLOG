import { adminTaxonomyError } from '../domain/admin-taxonomy-errors'
import { UNCATEGORIZED_CATEGORY_ID } from '../domain/taxonomy'
import type { CacheProvider } from '../providers/cache/cache-provider'
import type {
  AdminCategory,
  AdminTag,
  AdminTaxonomyOptions,
  AdminTaxonomyRepository
} from '../repositories/contracts/admin-taxonomy-repositories'
import { cacheKeys } from '../utils/cache-keys'
import { normalizeSlug } from './admin-post-service'

export interface AdminTaxonomyServiceDependencies {
  adminTaxonomyRepository: AdminTaxonomyRepository
  cache: CacheProvider
  generateId?: () => string
}

export interface CreateCategoryCommand {
  name: string
  slug?: string
  description?: string | null
  color?: string | null
  sortOrder?: number
}

export interface UpdateCategoryCommand {
  name?: string
  slug?: string
  description?: string | null
  color?: string | null
  sortOrder?: number
}

export interface CreateTagCommand {
  name: string
  slug?: string
  description?: string | null
  color?: string | null
  sortOrder?: number
}

export interface UpdateTagCommand {
  name?: string
  slug?: string
  description?: string | null
  color?: string | null
  sortOrder?: number
}

export function createAdminTaxonomyService(dependencies: AdminTaxonomyServiceDependencies) {
  const { adminTaxonomyRepository, cache } = dependencies
  const generateId = dependencies.generateId ?? (() => crypto.randomUUID())

  // Taxonomy pages join the home feed, archive, sitemap, and RSS, and a rename changes their public
  // URLs, so any category/tag mutation drops those shared resources plus the affected taxonomy key.
  function taxonomyInvalidationKeys(resourceKeys: string[], postSlugs: string[] = []): string[] {
    return [
      ...new Set([
        ...resourceKeys,
        ...postSlugs.map((slug) => cacheKeys.postSlug(slug)),
        cacheKeys.featuredPost(),
        cacheKeys.hotspots(),
        cacheKeys.home(),
        cacheKeys.archive(),
        cacheKeys.rss(),
        cacheKeys.sitemap()
      ])
    ]
  }

  function invalidateCategories(ids: string[], postSlugs: string[] = []): Promise<void> {
    return cache.delete(taxonomyInvalidationKeys(ids.map((id) => cacheKeys.category(id)), postSlugs))
  }

  function invalidateTags(ids: string[], postSlugs: string[] = []): Promise<void> {
    return cache.delete(taxonomyInvalidationKeys(ids.map((id) => cacheKeys.tag(id)), postSlugs))
  }

  function resolveSlug(raw: string): string {
    const slug = normalizeSlug(raw)
    if (!slug) {
      throw adminTaxonomyError(
        'invalid_slug',
        'Could not derive a slug from the name. Enter a slug manually (letters, numbers, and hyphens).',
        422
      )
    }
    return slug
  }

  async function assertCategorySlugAvailable(slug: string, excludeId: string | null) {
    const existing = await adminTaxonomyRepository.findCategoryBySlug(slug)
    if (existing && existing.id !== excludeId) {
      throw adminTaxonomyError('slug_conflict', `Slug "${slug}" is already in use`, 409)
    }
  }

  async function requireCategory(id: string): Promise<AdminCategory> {
    const category = await adminTaxonomyRepository.findCategoryById(id)
    if (!category) {
      throw adminTaxonomyError('not_found', 'Category not found', 404)
    }
    return category
  }

  async function assertTagSlugAvailable(slug: string, excludeId: string | null) {
    const existing = await adminTaxonomyRepository.findTagBySlug(slug)
    if (existing && existing.id !== excludeId) {
      throw adminTaxonomyError('slug_conflict', `Slug "${slug}" is already in use`, 409)
    }
  }

  async function requireTag(id: string): Promise<AdminTag> {
    const tag = await adminTaxonomyRepository.findTagById(id)
    if (!tag) {
      throw adminTaxonomyError('not_found', 'Tag not found', 404)
    }
    return tag
  }

  return {
    async getOptions(): Promise<AdminTaxonomyOptions> {
      const [categories, tags] = await Promise.all([
        adminTaxonomyRepository.listCategoryOptions(),
        adminTaxonomyRepository.listTagOptions()
      ])

      return { categories, tags }
    },

    listCategories(): Promise<AdminCategory[]> {
      return adminTaxonomyRepository.listCategoriesWithCounts()
    },

    async createCategory(command: CreateCategoryCommand): Promise<AdminCategory> {
      const slug = resolveSlug(command.slug ? command.slug : command.name)
      await assertCategorySlugAvailable(slug, null)

      const id = generateId()
      await adminTaxonomyRepository.createCategory({
        id,
        name: command.name,
        slug,
        description: command.description ?? null,
        color: command.color ?? null,
        sortOrder: command.sortOrder ?? 0
      })
      await invalidateCategories([id])
      return requireCategory(id)
    },

    async updateCategory(id: string, command: UpdateCategoryCommand): Promise<AdminCategory> {
      await requireCategory(id)

      let slug: string | undefined
      if (command.slug !== undefined) {
        slug = resolveSlug(command.slug)
        await assertCategorySlugAvailable(slug, id)
      }

      const affectedPostSlugs = await adminTaxonomyRepository.listPublishedPostSlugsByCategoryId(id)
      await adminTaxonomyRepository.updateCategory(id, {
        name: command.name,
        slug,
        description: command.description,
        color: command.color,
        sortOrder: command.sortOrder
      })
      await invalidateCategories([id], affectedPostSlugs)
      return requireCategory(id)
    },

    async deleteCategory(id: string): Promise<void> {
      const existing = await requireCategory(id)
      if (existing.isSystem) {
        throw adminTaxonomyError('category_protected', 'The default 未分类 category cannot be deleted', 409)
      }
      const affectedPostSlugs = await adminTaxonomyRepository.listPublishedPostSlugsByCategoryId(id)
      // Posts on this category are reassigned to 未分类 as part of the delete batch.
      await adminTaxonomyRepository.deleteCategoryReassigning(id, UNCATEGORIZED_CATEGORY_ID)
      await invalidateCategories([id, UNCATEGORIZED_CATEGORY_ID], affectedPostSlugs)
    },

    listTags(): Promise<AdminTag[]> {
      return adminTaxonomyRepository.listTagsWithCounts()
    },

    async createTag(command: CreateTagCommand): Promise<AdminTag> {
      const slug = resolveSlug(command.slug ? command.slug : command.name)
      await assertTagSlugAvailable(slug, null)

      const id = generateId()
      await adminTaxonomyRepository.createTag({
        id,
        name: command.name,
        slug,
        description: command.description ?? null,
        color: command.color ?? null,
        sortOrder: command.sortOrder ?? 0
      })
      await invalidateTags([id])
      return requireTag(id)
    },

    async updateTag(id: string, command: UpdateTagCommand): Promise<AdminTag> {
      await requireTag(id)

      let slug: string | undefined
      if (command.slug !== undefined) {
        slug = resolveSlug(command.slug)
        await assertTagSlugAvailable(slug, id)
      }

      const affectedPostSlugs = await adminTaxonomyRepository.listPublishedPostSlugsByTagIds([id])
      await adminTaxonomyRepository.updateTag(id, {
        name: command.name,
        slug,
        description: command.description,
        color: command.color,
        sortOrder: command.sortOrder
      })
      await invalidateTags([id], affectedPostSlugs)
      return requireTag(id)
    },

    async deleteTag(id: string): Promise<void> {
      await requireTag(id)
      const affectedPostSlugs = await adminTaxonomyRepository.listPublishedPostSlugsByTagIds([id])
      await adminTaxonomyRepository.deleteTag(id)
      await invalidateTags([id], affectedPostSlugs)
    },

    async mergeTags(sourceId: string, targetId: string): Promise<void> {
      if (sourceId === targetId) {
        throw adminTaxonomyError('invalid_merge', 'Cannot merge a tag into itself', 422)
      }
      await requireTag(sourceId)
      await requireTag(targetId)
      const affectedPostSlugs = await adminTaxonomyRepository.listPublishedPostSlugsByTagIds([
        sourceId,
        targetId
      ])
      await adminTaxonomyRepository.mergeTags(sourceId, targetId)
      // Both the removed source tag page and the target tag page change.
      await invalidateTags([sourceId, targetId], affectedPostSlugs)
    }
  }
}

export type AdminTaxonomyService = ReturnType<typeof createAdminTaxonomyService>
