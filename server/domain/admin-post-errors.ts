import { DomainError } from './domain-error'

export type AdminPostErrorCode =
  | 'not_found'
  | 'slug_conflict'
  | 'invalid_slug'
  | 'invalid_featured_post'

export class AdminPostDomainError extends DomainError {
  constructor(
    code: AdminPostErrorCode,
    message: string,
    statusCode: number,
    details: Record<string, unknown> = {}
  ) {
    super(code, message, statusCode, details)
    this.name = 'AdminPostDomainError'
  }
}

export function adminPostError(
  code: AdminPostErrorCode,
  message: string,
  statusCode: number,
  details: Record<string, unknown> = {}
): AdminPostDomainError {
  return new AdminPostDomainError(code, message, statusCode, details)
}
