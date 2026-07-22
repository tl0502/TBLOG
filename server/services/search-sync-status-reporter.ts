import type { SearchSyncOperation } from '../domain/search-sync'
import type { IntegrationSettingsRepository } from '../repositories/contracts/integration-repositories'
import type { SearchSyncJobRepository } from '../repositories/contracts/search-sync-repositories'
import type { SearchSyncHealthReporter } from './search-sync-health-reporter'

export interface SearchSyncStatusReporter {
  reportSuccess(input: { postId: string; operation: SearchSyncOperation }): Promise<void>
  reportFailure(input: { postId: string; operation: SearchSyncOperation }): Promise<void>
}

export function createSearchSyncStatusReporter(dependencies: {
  integrationRepository: IntegrationSettingsRepository
  jobRepository: SearchSyncJobRepository
  healthReporter: SearchSyncHealthReporter
  providerKey?: string
  now?: () => Date
}): SearchSyncStatusReporter {
  const providerKey = dependencies.providerKey ?? 'algolia'
  const now = dependencies.now ?? (() => new Date())

  async function enabled() {
    return (await dependencies.integrationRepository.findByCapabilityAndProvider(
      'search', providerKey
    ))?.enabled === true
  }

  async function refreshHealth() {
    const counts = await dependencies.jobRepository.countByProvider(providerKey)
    if (counts.dead > 0) return dependencies.healthReporter.markDead(providerKey, counts.dead)
    if (counts.pending > 0) return dependencies.healthReporter.markRetrying(providerKey, counts.pending)
    return dependencies.healthReporter.markHealthy(providerKey)
  }

  return {
    async reportSuccess(input) {
      if (!await enabled()) return
      await dependencies.jobRepository.clearPost(providerKey, input.postId, input.operation)
      await refreshHealth()
    },
    async reportFailure(input) {
      if (!await enabled()) return
      const timestamp = now()
      try {
        await dependencies.jobRepository.enqueue({
          providerKey,
          postId: input.postId,
          operation: input.operation,
          availableAt: timestamp,
          updatedAt: timestamp
        })
      } catch (error) {
        await dependencies.healthReporter.markQueueUnavailable(providerKey).catch(() => {})
        throw error
      }
      await refreshHealth()
    }
  }
}
