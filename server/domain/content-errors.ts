import { DomainError } from './domain-error'

export type ContentErrorCode =
  | 'processed_content_required'
  | 'content_processing_failed'

export class ContentDomainError extends DomainError {
  constructor(code: ContentErrorCode, message: string, statusCode: number) {
    super(code, message, statusCode)
    this.name = 'ContentDomainError'
  }
}

export function contentError(
  code: ContentErrorCode,
  message: string,
  statusCode: number
): ContentDomainError {
  return new ContentDomainError(code, message, statusCode)
}
