import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createCommentProtectionProviderForEvent } from '../providers/comment-protection/comment-protection-provider-factory'
import { createCommentModerationProviderForEvent } from '../providers/comment-moderation/comment-moderation-provider-factory'
import { createCommentReplicaProviderForEvent } from '../providers/comment-replica/comment-replica-provider-factory'
import { createCommentRepository } from '../repositories/comment-repository'
import { createSettingsRepository } from '../repositories/settings-repository'
import { createCommentService, type CommentSecurityEvent } from './comment-service'
import { sharedCommentRateLimiter } from './comment-rate-limiter'

export function logCommentSecurityEvent(entry: CommentSecurityEvent): void {
  console.warn(JSON.stringify({ scope: 'comment_security', ...entry }))
}

export function createCommentServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)

  return createCommentService({
    commentRepository: createCommentRepository(db),
    commentProtectionProvider: createCommentProtectionProviderForEvent(event),
    commentModerationProvider: createCommentModerationProviderForEvent(event),
    commentReplicaProvider: createCommentReplicaProviderForEvent(event),
    commentRateLimiter: sharedCommentRateLimiter,
    settingsRepository: createSettingsRepository(db),
    securityLogger: logCommentSecurityEvent
  })
}
