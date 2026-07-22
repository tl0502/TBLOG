import { DomainError } from './domain-error'

export type AuthErrorCode =
  | 'setup_already_completed'
  | 'invalid_credentials'
  | 'incorrect_current_password'
  | 'username_conflict'
  | 'two_factor_required'
  | 'invalid_two_factor'
  | 'two_factor_unavailable'
  | 'two_factor_not_pending'
  | 'two_factor_not_enabled'
  | 'ip_access_denied'
  | 'ip_self_lockout'
  | 'unauthorized'
  | 'forbidden'
  | 'missing_session_secret'
  | 'invalid_session_secret'
  | 'login_rate_limited'
  | 'invalid_request_origin'
  | 'login_audit_unavailable'
  | 'validation_failed'

export class AuthDomainError extends DomainError {
  constructor(
    code: AuthErrorCode,
    message: string,
    statusCode: number,
    details: Record<string, unknown> = {}
  ) {
    super(code, message, statusCode, details)
    this.name = 'AuthDomainError'
  }
}

export function authError(
  code: AuthErrorCode,
  message: string,
  statusCode: number,
  details: Record<string, unknown> = {}
): AuthDomainError {
  return new AuthDomainError(code, message, statusCode, details)
}
