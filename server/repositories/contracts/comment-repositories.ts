import type { CommentStatus, ModerationStatus } from '../../domain/comment'

export interface CommentPostTarget {
  id: string
  slug: string
  title: string
}

export interface PublicComment {
  id: string
  parentCommentId?: string | null
  replyToNickname?: string | null
  nickname: string
  content: string
  createdAt: Date
}

export interface AdminComment extends PublicComment {
  email: string | null
  status: CommentStatus
  reviewedAt: Date | null
  post: CommentPostTarget
  parent?: { id: string, nickname: string, content: string, status: CommentStatus } | null
}

export interface AdminCommentQuery {
  status?: CommentStatus
  offset: number
  limit: number
}

export interface AdminCommentPage {
  items: AdminComment[]
  total: number
  offset: number
  limit: number
}

export interface CreateCommentRecord {
  id: string
  postId: string
  nickname: string
  email: string | null
  content: string
  parentCommentId?: string | null
  replyTargetId?: string | null
  status: CommentStatus
  createdAt: Date
  reviewedAt: Date | null
}

export interface PublicCommentQuery {
  cursor?: string
  limit: number
}

export interface PublicCommentPage {
  items: PublicComment[]
  nextCursor: string | null
}

export interface AutoModerationComment {
  id: string
  nickname: string
  content: string
  status: CommentStatus
  post: CommentPostTarget
}

export interface CommentReplicaSource {
  id: string
  postId: string
  parentCommentId: string | null
  replyToNickname: string | null
  nickname: string
  content: string
  status: CommentStatus
  createdAt: Date
  reviewedAt: Date | null
}

export interface CreateCommentModerationResultRecord {
  commentId: string
  providerKey: string
  decision: 'allow' | 'reject'
  confidence: number | null
  categories: string[]
  reasons: string[]
  providerRequestId: string | null
  modelVersion: string | null
  createdAt: Date
  expiresAt: Date
}

export interface CommentRepository {
  findPublishedArticleBySlug(slug: string): Promise<CommentPostTarget | null>
  createComment(input: CreateCommentRecord): Promise<boolean>
  findCommentParent?(id: string): Promise<{ id: string, postId: string, parentCommentId: string | null, nickname: string, status: CommentStatus } | null>
  findCommentReplicaSource?(id: string): Promise<CommentReplicaSource | null>
  listReplicaSourcesForDeletion?(id: string): Promise<CommentReplicaSource[]>
  getReplicaFailureRevision?(providerKey: string, commentId: string): Promise<number | null>
  clearReplicaFailure?(providerKey: string, commentId: string, revision: number): Promise<void>
  enqueueReplicaFailure?(input: { providerKey: string, commentId: string, operation: 'upsert' | 'remove', payloadJson: string, error: string, now: Date }): Promise<void>
  saveModerationResult(input: CreateCommentModerationResultRecord): Promise<void>
  purgeExpiredModerationResults?(now: Date): Promise<number>
  listApprovedByPostId(postId: string, query: PublicCommentQuery): Promise<PublicCommentPage>
  listAdminComments(query: AdminCommentQuery): Promise<AdminCommentPage>
  findCommentsForAutoModeration(ids: string[]): Promise<AutoModerationComment[]>
  countPendingComments(): Promise<number>
  updateStatus(id: string, status: ModerationStatus, reviewedAt: Date): Promise<boolean>
  deleteComment(id: string): Promise<boolean>
}
