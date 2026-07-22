import type { IntegrationSettingsRepository } from '../repositories/contracts/integration-repositories'

export interface SearchSyncHealthReporter {
  markHealthy(providerKey: string): Promise<void>
  markRetrying(providerKey: string, pendingCount: number): Promise<void>
  markDead(providerKey: string, deadCount: number): Promise<void>
  markQueueUnavailable(providerKey: string): Promise<void>
}

export function createSearchSyncHealthReporter(dependencies: {
  integrationRepository: IntegrationSettingsRepository
  now?: () => Date
}): SearchSyncHealthReporter {
  const now = dependencies.now ?? (() => new Date())

  async function update(providerKey: string, lastError: string | null) {
    const row = await dependencies.integrationRepository.findByCapabilityAndProvider('search', providerKey)
    if (!row?.enabled) return
    const timestamp = now()
    await dependencies.integrationRepository.upsert({
      capability: row.capability,
      providerKey: row.providerKey,
      enabled: row.enabled,
      publicConfigJson: row.publicConfigJson ?? '{}',
      status: lastError ? 'misconfigured' : 'active',
      lastCheckedAt: timestamp,
      lastError,
      updatedAt: timestamp
    })
  }

  return {
    markHealthy(providerKey) {
      return update(providerKey, null)
    },
    markRetrying(providerKey, pendingCount) {
      return update(
        providerKey,
        `Search index synchronization is retrying ${pendingCount} pending job${pendingCount === 1 ? '' : 's'}.`
      )
    },
    markDead(providerKey, deadCount) {
      return update(
        providerKey,
        `Search index synchronization has ${deadCount} exhausted retry job${deadCount === 1 ? '' : 's'}. Run a full resync from Settings > Search.`
      )
    },
    markQueueUnavailable(providerKey) {
      return update(
        providerKey,
        'Search index synchronization failed and its automatic retry job could not be persisted. Run a full resync from Settings > Search.'
      )
    }
  }
}
