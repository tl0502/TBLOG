import { DomainError } from './domain-error'

export type PublicReadErrorCode = 'not_found' | 'invalid_pagination'

export class PublicReadDomainError extends DomainError {
  constructor(
    code: PublicReadErrorCode,
    message: string,
    statusCode: number,
    details: Record<string, unknown> = {}
  ) {
    super(code, message, statusCode, details)
    this.name = 'PublicReadDomainError'
  }
}

export function publicReadError(
  code: PublicReadErrorCode,
  message: string,
  statusCode: number,
  details: Record<string, unknown> = {}
): PublicReadDomainError {
  return new PublicReadDomainError(code, message, statusCode, details)
}
