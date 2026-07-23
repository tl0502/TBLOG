import { adminPostError } from '../domain/admin-post-errors'
import type { PostStatus, PostType } from '../domain/post'
import { UNCATEGORIZED_CATEGORY_ID } from '../domain/taxonomy'
import type { CacheProvider } from '../providers/cache/cache-provider'
import { createNoOpSearchProvider } from '../providers/search/no-op-search-provider'
import type { SearchProvider } from '../providers/search/search-provider'
import type {
  AdminPostEdit,
  AdminPostListPage,
  AdminPostListQuery,
  AdminPostRepository,
  UpdatePostSeoMetadata
} from '../repositories/contracts/admin-write-repositories'
import type { SearchIndexReadRepository } from '../repositories/contracts/search-repositories'
import { cacheKeys } from '../utils/cache-keys'
import type { ContentProcessingService } from './content-processing-service'
import type { SearchSyncStatusReporter } from './search-sync-status-reporter'

export type { SearchIndexReadRepository } from '../repositories/contracts/search-repositories'

export interface AdminPostServiceDependencies {
  adminPostRepository: AdminPostRepository
  contentProcessingService: ContentProcessingService
  cache: CacheProvider
  /** Optional full-text search sink. Defaults to a no-op provider when search is not configured. */
  searchProvider?: SearchProvider
  /** Optional source of index records. Without it, indexing is skipped (removals still run). */
  searchRecordSource?: SearchIndexReadRepository
  /** Persists non-blocking search write health for administrator visibility. */
  searchSyncStatusReporter?: SearchSyncStatusReporter
  now?: () => Date
  generateId?: () => string
}

export interface CreatePostCommand {
  type: PostType
  title: string
  slug?: string
  authorId: string
  categoryId?: string | null
  cover?: string | null
  customExcerpt?: string | null
  markdown?: string
  tagIds?: string[]
  seoTitle?: string | null
  seoDescription?: string | null
  canonicalUrlOverride?: string | null
  openGraphImageUrl?: string | null
  twitterImageUrl?: string | null
  jsonLdOverrideJson?: string | null
}

export interface UpdatePostCommand {
  title?: string
  slug?: string
  categoryId?: string | null
  cover?: string | null
  customExcerpt?: string | null
  markdown?: string
  tagIds?: string[]
  seoTitle?: string | null
  seoDescription?: string | null
  canonicalUrlOverride?: string | null
  openGraphImageUrl?: string | null
  twitterImageUrl?: string | null
  jsonLdOverrideJson?: string | null
}

const seoMetadataKeys = [
  'seoTitle',
  'seoDescription',
  'canonicalUrlOverride',
  'openGraphImageUrl',
  'twitterImageUrl',
  'jsonLdOverrideJson'
] as const

function seoMetadataFields(command: CreatePostCommand | UpdatePostCommand): UpdatePostSeoMetadata {
  return Object.fromEntries(
    seoMetadataKeys
      .filter((key) => command[key] !== undefined)
      .map((key) => [key, command[key]])
  ) as UpdatePostSeoMetadata
}

/** Normalize a slug to lowercase `[a-z0-9-]` with single dashes and no leading/trailing dash. */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function createAdminPostService(dependencies: AdminPostServiceDependencies) {
  const { adminPostRepository, contentProcessingService, cache } = dependencies
  const searchProvider = dependencies.searchProvider ?? createNoOpSearchProvider()
  const searchSyncStatusReporter = dependencies.searchSyncStatusReporter
  const now = dependencies.now ?? (() => new Date())
  const generateId = dependencies.generateId ?? (() => crypto.randomUUID())

  // Only real articles are searchable; page-type and draft content are never indexed.
  function isIndexable(post: AdminPostEdit): boolean {
    return post.type === 'article'
  }

  async function reportSearchSuccess(postId: string, operation: 'upsert' | 'remove'): Promise<void> {
    try {
      await searchSyncStatusReporter?.reportSuccess({ postId, operation })
    } catch (error) {
      console.error('[admin-post-service] failed to persist successful search sync status', error)
    }
  }

  async function reportSearchFailure(postId: string, operation: 'upsert' | 'remove'): Promise<void> {
    try {
      await searchSyncStatusReporter?.reportFailure({ postId, operation })
    } catch (error) {
      console.error('[admin-post-service] failed to persist search sync failure', error)
    }
  }

  // Push (insert/replace) the index record for a post. Any provider or read failure is swallowed so
  // a failing index never rolls back the article write — a later resync compensates.
  async function syncIndexRecord(id: string): Promise<void> {
    try {
      if (!dependencies.searchRecordSource) {
        return
      }
      const record = await dependencies.searchRecordSource.getSearchRecord(id)
      if (!record) {
        await reportSearchFailure(id, 'upsert')
        return
      }
      await searchProvider.indexRecord(record)
      await reportSearchSuccess(id, 'upsert')
    } catch (error) {
      console.error(`[admin-post-service] failed to index post ${id}`, error)
      await reportSearchFailure(id, 'upsert')
    }
  }

  // Remove a post's index record. Failures are swallowed for the same reason as indexing.
  async function removeIndexRecord(id: string): Promise<void> {
    try {
      await searchProvider.removeRecord(id)
      await reportSearchSuccess(id, 'remove')
    } catch (error) {
      console.error(`[admin-post-service] failed to remove post ${id} from search index`, error)
      await reportSearchFailure(id, 'remove')
    }
  }

  async function assertSlugAvailable(slug: string, excludeId: string | null) {
    const existing = await adminPostRepository.findBySlug(slug)
    if (existing && existing.id !== excludeId) {
      throw adminPostError('slug_conflict', `Slug "${slug}" is already in use`, 409)
    }
  }

  function resolveSlug(raw: string): string {
    const slug = normalizeSlug(raw)
    if (!slug) {
      throw adminPostError(
        'invalid_slug',
        'Could not derive a slug from the title. Enter a slug manually (letters, numbers, and hyphens).',
        422
      )
    }
    return slug
  }

  // Invalidate the public caches an affected published post participates in.
  async function invalidatePublic(input: {
    slugs: string[]
    categoryIds: Array<string | null>
    tagIds: string[]
    forceGeneration?: boolean
  }) {
    // A published article joins the home feed, archive, its own page, its taxonomy pages, and the
    // RSS/sitemap outputs — so its publish-state or content change invalidates all of them.
    const keys = new Set<string>([
      cacheKeys.home(),
      cacheKeys.featuredPost(),
      cacheKeys.hotspots(),
      cacheKeys.archive(),
      cacheKeys.rss(),
      cacheKeys.sitemap()
    ])
    for (const slug of input.slugs) {
      keys.add(cacheKeys.postSlug(slug))
    }
    for (const categoryId of input.categoryIds) {
      if (categoryId) keys.add(cacheKeys.category(categoryId))
    }
    for (const tagId of input.tagIds) {
      keys.add(cacheKeys.tag(tagId))
    }
    await cache.delete(
      [...keys],
      input.forceGeneration ? { forceGeneration: true } : undefined
    )
  }

  async function requirePost(id: string): Promise<AdminPostEdit> {
    const post = await adminPostRepository.findForEdit(id)
    if (!post) {
      throw adminPostError('not_found', 'Post not found', 404)
    }
    return post
  }

  function assertFeatureable(post: AdminPostEdit, status: PostStatus = post.status) {
    if (post.type !== 'article' || status !== 'published') {
      throw adminPostError(
        'invalid_featured_post',
        'Only published articles can be featured',
        422
      )
    }
  }

  return {
    list(query: AdminPostListQuery): Promise<AdminPostListPage> {
      return adminPostRepository.listPosts(query)
    },

    getForEdit(id: string): Promise<AdminPostEdit> {
      return requirePost(id)
    },

    // Resolve a post for editing by its (unique) slug. Returns null instead of throwing because a
    // singleton page like About may legitimately not exist yet — the caller renders a blank editor.
    async getForEditBySlug(slug: string): Promise<AdminPostEdit | null> {
      const found = await adminPostRepository.findBySlug(slug)
      return found ? adminPostRepository.findForEdit(found.id) : null
    },

    previewMarkdown(markdown: string) {
      return contentProcessingService.previewMarkdown(markdown)
    },

    async create(command: CreatePostCommand): Promise<{ id: string; slug: string }> {
      const slug = resolveSlug(command.slug ? command.slug : command.title)
      await assertSlugAvailable(slug, null)

      const id = generateId()
      await adminPostRepository.createPost({
        id,
        type: command.type,
        title: command.title,
        slug,
        authorId: command.authorId,
        // Every article has exactly one category; an omitted category falls back to 未分类.
        categoryId: command.categoryId ?? UNCATEGORIZED_CATEGORY_ID,
        cover: command.cover ?? null
      })

      const metadata = seoMetadataFields(command)
      if (Object.keys(metadata).length > 0) {
        await adminPostRepository.upsertSeoMetadata(id, metadata)
      }

      if (command.markdown !== undefined || command.customExcerpt !== undefined) {
        await contentProcessingService.processAndStore({
          postId: id,
          markdown: command.markdown ?? '',
          customExcerpt: command.customExcerpt
        })
      }
      if (command.tagIds && command.tagIds.length) {
        await adminPostRepository.setTags(id, command.tagIds)
      }

      // A new post is a draft → no public cache to invalidate.
      return { id, slug }
    },

    async update(id: string, command: UpdatePostCommand): Promise<{ id: string; slug: string }> {
      const existing = await requirePost(id)

      let slug = existing.slug
      if (command.slug !== undefined) {
        slug = resolveSlug(command.slug)
        await assertSlugAvailable(slug, id)
      }

      // An explicit null category resets to 未分类; undefined leaves the category unchanged.
      const categoryUpdate =
        command.categoryId === undefined
          ? undefined
          : command.categoryId ?? UNCATEGORIZED_CATEGORY_ID

      await adminPostRepository.updatePostFields(id, {
        title: command.title,
        slug: command.slug !== undefined ? slug : undefined,
        categoryId: categoryUpdate,
        cover: command.cover
      })

      const metadata = seoMetadataFields(command)
      if (Object.keys(metadata).length > 0) {
        await adminPostRepository.upsertSeoMetadata(id, metadata)
      }

      if (command.markdown !== undefined || command.customExcerpt !== undefined) {
        await contentProcessingService.processAndStore({
          postId: id,
          markdown: command.markdown ?? existing.markdown,
          customExcerpt: command.customExcerpt !== undefined
            ? command.customExcerpt
            : existing.customExcerpt
        })
      }
      if (command.tagIds !== undefined) {
        await adminPostRepository.setTags(id, command.tagIds)
      }

      if (existing.status === 'published') {
        await invalidatePublic({
          slugs: [existing.slug, slug],
          categoryIds: [
            existing.categoryId,
            categoryUpdate !== undefined ? categoryUpdate : existing.categoryId
          ],
          tagIds: command.tagIds !== undefined
            ? [...existing.tagIds, ...command.tagIds]
            : existing.tagIds
        })
        // Re-index a published article after its content/taxonomy may have changed.
        if (isIndexable(existing)) {
          await syncIndexRecord(id)
        }
      }

      return { id, slug }
    },

    async changeStatus(id: string, status: PostStatus): Promise<void> {
      const existing = await requirePost(id)

      if (status === 'published') {
        await contentProcessingService.assertPublishableProcessedOutput(id)
        await adminPostRepository.setStatus(id, 'published', existing.publishedAt ?? now())
      } else {
        // Unpublish keeps the original publishedAt; only the status flips.
        await adminPostRepository.setStatus(id, 'draft', existing.publishedAt)
      }

      // Visibility changed (publish or unpublish of a once-public post) → invalidate.
      if (status === 'published' || existing.status === 'published') {
        await invalidatePublic({
          slugs: [existing.slug],
          categoryIds: [existing.categoryId],
          tagIds: existing.tagIds,
          // KV deletes are eventually consistent. A withdrawal must make the old generation
          // unreachable instead of waiting for every region's cached value to expire.
          forceGeneration: status === 'draft' && existing.status === 'published'
        })
      }

      // Keep the search index aligned with visibility: publish → index, unpublish → remove.
      if (isIndexable(existing)) {
        if (status === 'published') {
          await syncIndexRecord(id)
        } else if (existing.status === 'published') {
          await removeIndexRecord(id)
        }
      }
    },

    async changeFeatured(id: string, featured: boolean): Promise<void> {
      const existing = await requirePost(id)
      if (featured) assertFeatureable(existing)

      await adminPostRepository.setFeatured(id, featured)
      await cache.delete([cacheKeys.home(), cacheKeys.featuredPost(), cacheKeys.hotspots()])
    },

    async validateFeaturedChange(
      id: string,
      featured: boolean,
      targetStatus?: PostStatus
    ): Promise<void> {
      if (!featured) return
      const existing = await requirePost(id)
      assertFeatureable(existing, targetStatus ?? existing.status)
    },

    async delete(id: string): Promise<void> {
      const existing = await requirePost(id)
      await adminPostRepository.deletePost(id)

      if (existing.status === 'published') {
        await invalidatePublic({
          slugs: [existing.slug],
          categoryIds: [existing.categoryId],
          tagIds: existing.tagIds,
          forceGeneration: true
        })
        if (isIndexable(existing)) {
          await removeIndexRecord(id)
        }
      }
    }
  }
}

export type AdminPostService = ReturnType<typeof createAdminPostService>
