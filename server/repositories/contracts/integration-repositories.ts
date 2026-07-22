import type { IntegrationStatus } from '../../domain/integration'

export interface StoredIntegration {
  capability: string
  providerKey: string
  enabled: boolean
  publicConfigJson: string | null
  status: IntegrationStatus
  lastCheckedAt: Date | null
  lastError: string | null
  updatedAt: Date
}

export interface UpsertIntegrationRecord {
  capability: string
  providerKey: string
  enabled: boolean
  publicConfigJson: string
  status: IntegrationStatus
  lastCheckedAt: Date | null
  lastError: string | null
  updatedAt: Date
}

export interface IntegrationSettingsRepository {
  list(): Promise<StoredIntegration[]>
  findByCapabilityAndProvider(
    capability: string,
    providerKey: string
  ): Promise<StoredIntegration | null>
  upsert(record: UpsertIntegrationRecord): Promise<void>
  /** Persist probe/resync status without advancing an existing provider configuration generation. */
  upsertOperationalStatus?(record: UpsertIntegrationRecord): Promise<void>
  /** Persist one provider and disable every other provider in the capability atomically. */
  upsertExclusive(record: UpsertIntegrationRecord, capability: string): Promise<void>
  /** Persist the selected report provider and invalidate the current report snapshot atomically. */
  upsertAnalyticsReportExclusive?(record: UpsertIntegrationRecord): Promise<void>
  touch(capability: string, providerKey: string, updatedAt: Date): Promise<void>
}
