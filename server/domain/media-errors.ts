import { DomainError } from './domain-error'

export type MediaErrorCode =
  | 'invalid_media'
  | 'storage_unavailable'
  | 'media_upload_failed'

export function mediaError(
  code: MediaErrorCode,
  message: string,
  statusCode: number,
  details: Record<string, unknown> = {}
) {
  return new DomainError(code, message, statusCode, details)
}
