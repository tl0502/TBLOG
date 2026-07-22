import { DomainError } from './domain-error'

export type IntegrationErrorCode = 'provider_not_found' | 'action_not_found' | 'invalid_config'

export function integrationError(
  code: IntegrationErrorCode,
  message: string,
  statusCode: number,
  details: Record<string, unknown> = {}
) {
  return new DomainError(code, message, statusCode, details)
}
