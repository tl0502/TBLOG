import type { PostStatus, PostType } from '../../domain/post'
import type { ProcessingState } from '../../domain/content'

export interface AdminPostListItem {
  id: string
  title: string
  slug: string
  type: PostType
  status: PostStatus
  featured: boolean
  featuredOrder?: number
  updatedAt: Date
  publishedAt: Date | null
  categoryId: string | null
  tagIds: string[]
}

/**
 * A single page of the admin post list. `status`/`search`/`tagId`/`slug` narrow the set server-side
 * so the client never ships the whole table; `offset`/`limit` window the result. Filters are optional
 * and combine with AND. `slug` is an exact match for singleton lookups (e.g. About).
 */
export interface AdminPostListQuery {
  offset: number
  limit: number
  search?: string
  status?: PostStatus
  tagId?: string
  slug?: string
}

export interface AdminPostListPage {
  items: AdminPostListItem[]
  /** Total rows matching the filters, ignoring the offset/limit window — drives the pager. */
  total: number
}

export interface PostSeoMetadata {
  seoTitle: string | null
  seoDescription: string | null
  canonicalUrlOverride: string | null
  openGraphImageUrl: string | null
  twitterImageUrl: string | null
  jsonLdOverrideJson: string | null
}

export interface AdminPostEdit extends AdminPostListItem, PostSeoMetadata {
  cover: string | null
  tagIds: string[]
  markdown: string
  customExcerpt: string | null
  processingState: ProcessingState
  processingError: string | null
}

export interface CreatePostInput {
  id: string
  type: PostType
  title: string
  slug: string
  authorId: string
  categoryId: string | null
  cover: string | null
}

export interface UpdatePostFields {
  title?: string
  slug?: string
  categoryId?: string | null
  cover?: string | null
}

export type UpdatePostSeoMetadata = Partial<PostSeoMetadata>

/**
 * Admin post writes. D1 has no interactive transactions, so multi-row operations are sequenced;
 * callers order writes so a mid-sequence failure leaves a recoverable draft, never a broken post.
 */
export interface AdminPostRepository {
  listPosts(query: AdminPostListQuery): Promise<AdminPostListPage>
  findForEdit(id: string): Promise<AdminPostEdit | null>
  createPost(input: CreatePostInput): Promise<void>
  updatePostFields(id: string, fields: UpdatePostFields): Promise<void>
  upsertSeoMetadata(postId: string, fields: UpdatePostSeoMetadata): Promise<void>
  setStatus(
    id: string,
    status: PostStatus,
    publishedAt: Date | null
  ): Promise<{ slug: string; categoryId: string | null } | null>
  setFeatured(id: string, featured: boolean): Promise<void>
  setTags(postId: string, tagIds: string[]): Promise<void>
  deletePost(id: string): Promise<{ slug: string; status: PostStatus } | null>
  findBySlug(slug: string): Promise<{ id: string } | null>
}
