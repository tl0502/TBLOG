import { DomainError } from './domain-error'

export type AdminTaxonomyErrorCode =
  | 'not_found'
  | 'slug_conflict'
  | 'invalid_slug'
  | 'category_protected'
  | 'invalid_merge'

export class AdminTaxonomyDomainError extends DomainError {
  constructor(
    code: AdminTaxonomyErrorCode,
    message: string,
    statusCode: number,
    details: Record<string, unknown> = {}
  ) {
    super(code, message, statusCode, details)
    this.name = 'AdminTaxonomyDomainError'
  }
}

export function adminTaxonomyError(
  code: AdminTaxonomyErrorCode,
  message: string,
  statusCode: number,
  details: Record<string, unknown> = {}
): AdminTaxonomyDomainError {
  return new AdminTaxonomyDomainError(code, message, statusCode, details)
}
