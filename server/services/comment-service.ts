import { authError } from '../domain/auth-errors'
import { commentError } from '../domain/comment-errors'
import type { ModerationStatus } from '../domain/comment'
import type { CommentProtectionProvider } from '../providers/comment-protection/comment-protection-provider'
import type { CommentModerationProvider } from '../providers/comment-moderation/comment-moderation-provider'
import type { CommentReplicaProvider } from '../providers/comment-replica/comment-replica-provider'
import { CommentReplicaDisabledError } from '../providers/comment-replica/comment-replica-provider'
import type {
  AdminCommentQuery,
  AutoModerationComment,
  CommentPostTarget,
  CommentRepository
} from '../repositories/contracts/comment-repositories'
import type { Permission } from './permissions'
import type { SettingsRepository } from '../repositories/contracts/settings-repositories'
import { CommentProtectionProviderError } from '../providers/comment-protection/comment-protection-provider'
import type { CommentRateLimiter } from './comment-rate-limiter'

export interface CommentServiceDependencies {
  commentRepository: CommentRepository
  commentProtectionProvider: CommentProtectionProvider
  commentModerationProvider?: CommentModerationProvider
  commentModerationProviderKey?: string
  commentReplicaProvider?: CommentReplicaProvider | null
  commentRateLimiter?: CommentRateLimiter
  settingsRepository?: SettingsRepository
  securityLogger?: (event: CommentSecurityEvent) => void
  now?: () => Date
  generateId?: () => string
}

export interface SubmitCommentCommand {
  nickname: string
  email?: string
  content: string
  protectionToken?: string
  remoteIp?: string
  expectedHostname?: string
  parentCommentId?: string
}

export type AutoModerationOutcome = 'approved' | 'rejected' | 'review_required' | 'failed' | 'not_found'

export interface CommentSecurityEvent {
  event:
    | 'comment_rate_limited'
    | 'comment_ingress_rate_limited'
    | 'comment_protection_rejected'
    | 'comment_protection_unavailable'
    | 'comment_moderation_fallback'
    | 'comment_moderation_review_required'
    | 'comment_moderation_audit_write_failed'
  providerKey?: string
  postId?: string
  commentId?: string
}

export interface AutoModerationItemResult {
  id: string
  outcome: AutoModerationOutcome
  status: 'pending' | 'approved' | 'rejected' | null
}

export const AUTO_MODERATION_MIN_CONFIDENCE = 0.9

function normalizeModerationText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function moderationStatus(
  result: Awaited<ReturnType<CommentModerationProvider['moderate']>>
): 'approved' | 'rejected' | null {
  if (
    result.confidence === null
    || !Number.isFinite(result.confidence)
    || result.confidence < AUTO_MODERATION_MIN_CONFIDENCE
    || result.confidence > 1
  ) return null
  return result.decision === 'allow' ? 'approved' : 'rejected'
}

function requireCommentPermission(permissions: readonly Permission[]): void {
  if (!permissions.includes('comment:*')) {
    throw authError('forbidden', 'Permission denied', 403)
  }
}

export function createCommentService(dependencies: CommentServiceDependencies) {
  const now = dependencies.now ?? (() => new Date())
  const generateId = dependencies.generateId ?? (() => crypto.randomUUID())
  const logSecurityEvent = (event: CommentSecurityEvent) => dependencies.securityLogger?.(event)

  async function replicateUpsert(commentId: string): Promise<void> {
    if (!dependencies.commentReplicaProvider || !dependencies.commentRepository.findCommentReplicaSource) return
    const source = await dependencies.commentRepository.findCommentReplicaSource(commentId)
    if (!source) return
    const event = {
      operation: 'upsert',
      comment: {
        ...source,
        createdAt: source.createdAt.toISOString(),
        reviewedAt: source.reviewedAt?.toISOString() ?? null
      }
    } as const
    const providerKey = dependencies.commentReplicaProvider.providerKey
    const revision = await dependencies.commentRepository.getReplicaFailureRevision?.(providerKey, commentId).catch(() => null) ?? null
    try {
      await dependencies.commentReplicaProvider.replicate(event)
      if (revision !== null) {
        await dependencies.commentRepository.clearReplicaFailure?.(providerKey, commentId, revision).catch(() => {})
      }
    } catch (error) {
      if (error instanceof CommentReplicaDisabledError) return
      await dependencies.commentRepository.enqueueReplicaFailure?.({
        providerKey: dependencies.commentReplicaProvider!.providerKey,
        commentId,
        operation: 'upsert',
        payloadJson: JSON.stringify(event),
        error: error instanceof Error ? error.message : 'Replica write failed',
        now: now()
      }).catch(() => {})
    }
  }

  async function replicateRemove(commentId: string, postId: string): Promise<void> {
    if (!dependencies.commentReplicaProvider) return
    const event = { operation: 'remove', commentId, postId } as const
    const providerKey = dependencies.commentReplicaProvider.providerKey
    const revision = await dependencies.commentRepository.getReplicaFailureRevision?.(providerKey, commentId).catch(() => null) ?? null
    try {
      await dependencies.commentReplicaProvider.replicate(event)
      if (revision !== null) {
        await dependencies.commentRepository.clearReplicaFailure?.(providerKey, commentId, revision).catch(() => {})
      }
    } catch (error) {
      if (error instanceof CommentReplicaDisabledError) return
      await dependencies.commentRepository.enqueueReplicaFailure?.({
        providerKey,
        commentId,
        operation: 'remove',
        payloadJson: JSON.stringify(event),
        error: error instanceof Error ? error.message : 'Replica remove failed',
        now: now()
      }).catch(() => {})
    }
  }

  async function requireTarget(slug: string): Promise<CommentPostTarget> {
    const target = await dependencies.commentRepository.findPublishedArticleBySlug(slug)

    if (!target) {
      throw commentError('not_found', 'Post not found', 404)
    }

    return target
  }

  async function saveModerationResult(
    commentId: string,
    result: Awaited<ReturnType<CommentModerationProvider['moderate']>>,
    createdAt: Date
  ): Promise<void> {
    await dependencies.commentRepository.saveModerationResult({
      commentId,
      providerKey:
        dependencies.commentModerationProvider?.providerKey
        ?? dependencies.commentModerationProviderKey
        ?? 'unknown',
      decision: result.decision,
      confidence: result.confidence,
      categories: result.categories,
      reasons: result.reasons,
      providerRequestId: result.providerRequestId,
      modelVersion: result.modelVersion,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    }).catch(() => {
      // Audit persistence must not turn an already-decided comment into a failed action.
      logSecurityEvent({
        event: 'comment_moderation_audit_write_failed',
        providerKey:
          dependencies.commentModerationProvider?.providerKey
          ?? dependencies.commentModerationProviderKey
          ?? 'unknown',
        commentId
      })
    })
  }

  async function moderateExistingComment(
    target: AutoModerationComment,
    locale: string
  ): Promise<AutoModerationItemResult> {
    if (!dependencies.commentModerationProvider) {
      return { id: target.id, outcome: 'failed', status: target.status }
    }

    try {
      const result = await dependencies.commentModerationProvider.moderate({
        nickname: normalizeModerationText(target.nickname),
        content: normalizeModerationText(target.content),
        locale,
        post: { id: target.post.id, title: target.post.title }
      })
      const reviewedAt = now()
      const status = moderationStatus(result)
      if (!status) {
        await saveModerationResult(target.id, result, reviewedAt)
        logSecurityEvent({
          event: 'comment_moderation_review_required',
          providerKey: dependencies.commentModerationProvider.providerKey ?? 'unknown',
          commentId: target.id,
          postId: target.post.id
        })
        return { id: target.id, outcome: 'review_required', status: target.status }
      }
      if (!(await dependencies.commentRepository.updateStatus(target.id, status, reviewedAt))) {
        return { id: target.id, outcome: 'not_found', status: null }
      }
      await saveModerationResult(target.id, result, reviewedAt)
      await replicateUpsert(target.id)
      return { id: target.id, outcome: status, status }
    } catch {
      logSecurityEvent({
        event: 'comment_moderation_fallback',
        providerKey: dependencies.commentModerationProvider?.providerKey ?? 'unconfigured',
        commentId: target.id,
        postId: target.post.id
      })
      return { id: target.id, outcome: 'failed', status: target.status }
    }
  }

  return {
    async listPublic(slug: string, query: { cursor?: string, limit: number } = { limit: 20 }) {
      const target = await requireTarget(slug)
      if (dependencies.settingsRepository) {
        const settings = await dependencies.settingsRepository.getDomain('comment')
        if (!settings.enabled) return { items: [], nextCursor: null }
      }
      const page = await dependencies.commentRepository.listApprovedByPostId(target.id, query)
      const rows = page.items
      const topLevel = rows.filter((comment) => comment.parentCommentId === null)
      const repliesByParent = new Map<string, typeof rows>()
      for (const comment of rows) {
        if (!comment.parentCommentId) continue
        const replies = repliesByParent.get(comment.parentCommentId) ?? []
        replies.push(comment)
        repliesByParent.set(comment.parentCommentId, replies)
      }
      return { items: topLevel.map((comment) => ({
        id: comment.id,
        nickname: comment.nickname,
        content: comment.content,
        createdAt: comment.createdAt,
        replies: (repliesByParent.get(comment.id) ?? []).map((reply) => ({
          id: reply.id,
          parentCommentId: comment.id,
          replyToNickname: reply.replyToNickname,
          nickname: reply.nickname,
          content: reply.content,
          createdAt: reply.createdAt
        }))
      })), nextCursor: page.nextCursor }
    },

    async submit(slug: string, command: SubmitCommentCommand) {
      const target = await requireTarget(slug)
      const nickname = command.nickname.normalize('NFKC').trim()
      if (!nickname || nickname.length > 80) {
        throw commentError('validation_failed', 'Nickname is invalid after normalization', 422)
      }
      let autoModerationEnabled = false
      let configuredRateLimit: { windowSeconds: number | null, maxPerWindow: number | null } = {
        windowSeconds: null,
        maxPerWindow: null
      }
      let siteName = 'TBLOG'
      let siteLocale = 'zh-CN'
      if (dependencies.settingsRepository) {
        const settings = await dependencies.settingsRepository.getDomain('comment')
        if (!settings.enabled) {
          throw commentError('comments_disabled', 'Comments are disabled', 403)
        }
        autoModerationEnabled = settings.autoModerationEnabled
        configuredRateLimit = settings.rateLimit
        const site = await dependencies.settingsRepository.getDomain('site')
        siteName = site.siteName
        siteLocale = site.locale
      }
      const reservedNicknames = new Set([
        siteName,
        'admin',
        'administrator',
        '管理员',
        '作者'
      ].map((value) => value.normalize('NFKC').trim().toLocaleLowerCase(siteLocale)))
      if (reservedNicknames.has(nickname.toLocaleLowerCase(siteLocale))) {
        throw commentError('validation_failed', 'Nickname is reserved', 422)
      }

      let parentCommentId: string | null = null
      let replyTargetId: string | null = null
      if (command.parentCommentId) {
        const parent = await dependencies.commentRepository.findCommentParent?.(command.parentCommentId)
        if (!parent || parent.postId !== target.id || parent.status !== 'approved') {
          throw commentError('parent_not_found', 'Reply target not found', 404)
        }
        if (parent.parentCommentId) {
          const root = await dependencies.commentRepository.findCommentParent?.(parent.parentCommentId)
          if (!root || root.postId !== target.id || root.status !== 'approved' || root.parentCommentId) {
            throw commentError('parent_not_found', 'Reply target not found', 404)
          }
          parentCommentId = root.id
        } else {
          parentCommentId = parent.id
        }
        replyTargetId = parent.id
      }

      if (dependencies.commentRateLimiter) {
        const windowSeconds = configuredRateLimit.windowSeconds && configuredRateLimit.windowSeconds > 0
          ? configuredRateLimit.windowSeconds
          : 60
        const maxPerWindow = configuredRateLimit.maxPerWindow && configuredRateLimit.maxPerWindow > 0
          ? configuredRateLimit.maxPerWindow
          : 5
        const rateLimit = dependencies.commentRateLimiter.consume(
          // Cloudflare supplies cf-connecting-ip in production. If a platform omits it, keep a
          // conservative shared bucket rather than allowing unlimited comment writes.
          `comment-submit:${command.remoteIp ?? 'anonymous'}`,
          { windowSeconds, maxPerWindow },
          now()
        )
        if (!rateLimit.allowed) {
          logSecurityEvent({ event: 'comment_rate_limited', postId: target.id })
          throw commentError(
            'rate_limited',
            'Too many comment attempts. Please try again later',
            429,
            { retryAfterSeconds: rateLimit.retryAfterSeconds }
          )
        }
      }

      try {
        await dependencies.commentProtectionProvider.verify({
          token: command.protectionToken,
          remoteIp: command.remoteIp,
          expectedHostname: command.expectedHostname
        })
      } catch (error) {
        if (error instanceof CommentProtectionProviderError) {
          logSecurityEvent({
            event: error.kind === 'unavailable'
              ? 'comment_protection_unavailable'
              : 'comment_protection_rejected',
            postId: target.id
          })
          throw error.kind === 'unavailable'
            ? commentError('protection_unavailable', 'Comment protection is temporarily unavailable', 503)
            : commentError('protection_rejected', 'Comment protection verification failed', 422)
        }
        throw error
      }

      const id = generateId()
      const createdAt = now()
      let status: 'pending' | 'approved' | 'rejected' = 'pending'
      let reviewedAt: Date | null = null
      let moderationResult: Awaited<ReturnType<NonNullable<CommentModerationProvider['moderate']>>> | null = null

      if (autoModerationEnabled) {
        if (dependencies.commentModerationProvider) {
          try {
            const result = await dependencies.commentModerationProvider.moderate({
              nickname: normalizeModerationText(nickname),
              content: normalizeModerationText(command.content),
              locale: siteLocale,
              post: { id: target.id, title: target.title }
            })
            moderationResult = result
            const resolvedStatus = moderationStatus(result)
            if (resolvedStatus) {
              status = resolvedStatus
              reviewedAt = createdAt
            } else {
              logSecurityEvent({
                event: 'comment_moderation_review_required',
                providerKey: dependencies.commentModerationProvider.providerKey ?? 'unknown',
                commentId: id,
                postId: target.id
              })
            }
          } catch {
            // ADR 2026-07: once protection succeeds, provider failure falls back to the manual queue.
            status = 'pending'
            reviewedAt = null
            logSecurityEvent({
              event: 'comment_moderation_fallback',
              providerKey: dependencies.commentModerationProvider.providerKey ?? 'unknown',
              commentId: id,
              postId: target.id
            })
          }
        }
      }

      const created = await dependencies.commentRepository.createComment({
        id,
        postId: target.id,
        nickname,
        email: command.email ?? null,
        content: command.content,
        parentCommentId,
        replyTargetId,
        status,
        createdAt,
        reviewedAt
      })
      if (!created) {
        throw commentError('parent_not_found', 'Reply target not found', 404)
      }

      if (moderationResult) {
        await saveModerationResult(id, moderationResult, createdAt)
      }
      await replicateUpsert(id)

      return { id, status }
    },

    listAdmin(query: AdminCommentQuery, permissions: readonly Permission[]) {
      requireCommentPermission(permissions)
      return dependencies.commentRepository.listAdminComments(query)
    },

    async getCounts(permissions: readonly Permission[]) {
      requireCommentPermission(permissions)
      return { pending: await dependencies.commentRepository.countPendingComments() }
    },

    async moderate(id: string, status: ModerationStatus, permissions: readonly Permission[]) {
      requireCommentPermission(permissions)

      if (!(await dependencies.commentRepository.updateStatus(id, status, now()))) {
        throw commentError('comment_not_found', 'Comment not found', 404)
      }

      await replicateUpsert(id)

      return { id, status }
    },

    async autoModerate(ids: string[], permissions: readonly Permission[]) {
      requireCommentPermission(permissions)
      const [targets, site] = await Promise.all([
        dependencies.commentRepository.findCommentsForAutoModeration(ids),
        dependencies.settingsRepository?.getDomain('site')
      ])
      const byId = new Map(targets.map((target) => [target.id, target]))
      // The controller caps the batch at eight to keep the complete D1/provider request within the
      // Workers Free subrequest budget. Run the bounded set concurrently so provider
      // timeouts do not accumulate into a multi-minute administrator request.
      const results = await Promise.all(ids.map(async (id): Promise<AutoModerationItemResult> => {
        const target = byId.get(id)
        return target
          ? await moderateExistingComment(target, site?.locale ?? 'zh-CN')
          : { id, outcome: 'not_found', status: null }
      }))

      const succeeded = results.filter(
        (result) => result.outcome === 'approved' || result.outcome === 'rejected'
      ).length
      return {
        results,
        summary: { requested: ids.length, succeeded, failed: ids.length - succeeded }
      }
    },

    async remove(id: string, permissions: readonly Permission[]) {
      requireCommentPermission(permissions)

      const singleSource = dependencies.commentRepository.listReplicaSourcesForDeletion
        ? null
        : await dependencies.commentRepository.findCommentReplicaSource?.(id) ?? null
      const sources = dependencies.commentRepository.listReplicaSourcesForDeletion
        ? await dependencies.commentRepository.listReplicaSourcesForDeletion(id)
        : singleSource ? [singleSource] : []

      if (!(await dependencies.commentRepository.deleteComment(id))) {
        throw commentError('comment_not_found', 'Comment not found', 404)
      }

      for (const source of sources) {
        if (source) await replicateRemove(source.id, source.postId)
      }

      return { id }
    },

    async purgeExpiredModerationResults(permissions: readonly Permission[], now = new Date()) {
      if (!permissions.includes('maintenance:*')) {
        throw authError('forbidden', 'Permission denied', 403)
      }

      return dependencies.commentRepository.purgeExpiredModerationResults?.(now) ?? 0
    }
  }
}

export type CommentService = ReturnType<typeof createCommentService>
