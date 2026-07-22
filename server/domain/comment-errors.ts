import { DomainError } from './domain-error'

export type CommentErrorCode =
  | 'not_found'
  | 'comment_not_found'
  | 'comments_disabled'
  | 'parent_not_found'
  | 'validation_failed'
  | 'protection_rejected'
  | 'protection_unavailable'
  | 'payload_too_large'
  | 'rate_limited'
  | 'invalid_pagination'

export function commentError(
  code: CommentErrorCode,
  message: string,
  statusCode: number,
  details: Record<string, unknown> = {}
) {
  return new DomainError(code, message, statusCode, details)
}
