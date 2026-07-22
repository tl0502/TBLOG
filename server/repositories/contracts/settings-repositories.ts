import type { ProfileSettings, SettingsByDomain, SettingsDomain } from '../../domain/settings'

export interface ProfileSettingsSnapshot {
  value: ProfileSettings
  revision: number | null
}

/**
 * Per-domain settings persistence. Each domain is a single-row table; reads return domain defaults
 * when the row does not exist yet, writes upsert the singleton row. No interactive transactions —
 * every operation is a single D1 statement (see architecture.md).
 */
export interface SettingsRepository {
  getDomain<TDomain extends SettingsDomain>(domain: TDomain): Promise<SettingsByDomain[TDomain]>
  getProfileSnapshot(): Promise<ProfileSettingsSnapshot>
  saveDomain<TDomain extends SettingsDomain>(
    domain: TDomain,
    value: SettingsByDomain[TDomain]
  ): Promise<void>
  saveProfileIfRevision(value: ProfileSettings, expectedRevision: number | null): Promise<number | null>
}
