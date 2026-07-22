import { DomainError } from './domain-error'

export type SettingsErrorCode = 'invalid_domain' | 'validation_failed' | 'integration_required' | 'settings_conflict'

export class SettingsDomainError extends DomainError {
  constructor(
    code: SettingsErrorCode,
    message: string,
    statusCode: number,
    details: Record<string, unknown> = {}
  ) {
    super(code, message, statusCode, details)
    this.name = 'SettingsDomainError'
  }
}

export function settingsError(
  code: SettingsErrorCode,
  message: string,
  statusCode: number,
  details: Record<string, unknown> = {}
): SettingsDomainError {
  return new SettingsDomainError(code, message, statusCode, details)
}
