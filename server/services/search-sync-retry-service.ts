import type { SearchProvider } from '../providers/search/search-provider'
import type { SearchIndexReadRepository } from '../repositories/contracts/search-repositories'
import type {
  SearchSyncJob,
  SearchSyncJobRepository
} from '../repositories/contracts/search-sync-repositories'
import type { SearchSyncHealthReporter } from './search-sync-health-reporter'

const DEFAULT_BATCH_LIMIT = 10
const MAX_BATCH_LIMIT = 20
const DEFAULT_LEASE_MS = 60_000
const DEFAULT_MAX_ATTEMPTS = 8
const DEFAULT_BASE_DELAY_MS = 60_000
const DEFAULT_MAX_DELAY_MS = 6 * 60 * 60 * 1000
const DEFAULT_REMOVE_BASE_DELAY_MS = 30_000
const DEFAULT_REMOVE_MAX_DELAY_MS = 5 * 60 * 1000

export interface SearchSyncRetryServiceDependencies {
  jobRepository: SearchSyncJobRepository
  searchRecordSource: SearchIndexReadRepository
  searchProvider: SearchProvider | null
  enabled?: boolean
  healthReporter: SearchSyncHealthReporter
  providerKey?: string
  now?: () => Date
  generateOwnerToken?: () => string
  leaseMs?: number
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  removeBaseDelayMs?: number
  removeMaxDelayMs?: number
}

export interface SearchSyncRetryResult {
  claimed: number
  succeeded: number
  failed: number
  dead: number
  pending: number
}

export function retryDelayMs(
  attemptCount: number,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS
): number {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attemptCount - 1))
}

export function createSearchSyncRetryService(dependencies: SearchSyncRetryServiceDependencies) {
  const providerKey = dependencies.providerKey ?? 'algolia'
  const enabled = dependencies.enabled ?? true
  const now = dependencies.now ?? (() => new Date())
  const generateOwnerToken = dependencies.generateOwnerToken ?? (() => crypto.randomUUID())
  const leaseMs = dependencies.leaseMs ?? DEFAULT_LEASE_MS
  const maxAttempts = dependencies.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseDelayMs = dependencies.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const maxDelayMs = dependencies.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const removeBaseDelayMs = dependencies.removeBaseDelayMs ?? DEFAULT_REMOVE_BASE_DELAY_MS
  const removeMaxDelayMs = dependencies.removeMaxDelayMs ?? DEFAULT_REMOVE_MAX_DELAY_MS

  async function apply(job: SearchSyncJob): Promise<void> {
    if (!dependencies.searchProvider) {
      throw new Error('Search provider is unavailable')
    }
    if (job.operation === 'remove') {
      await dependencies.searchProvider.removeRecord(job.postId)
      return
    }

    const record = await dependencies.searchRecordSource.getSearchRecord(job.postId)
    if (record) {
      await dependencies.searchProvider.indexRecord(record)
    } else {
      // The post changed again after the failed upsert. Converge to current D1 visibility.
      await dependencies.searchProvider.removeRecord(job.postId)
    }
  }

  return {
    async processBatch(requestedLimit = DEFAULT_BATCH_LIMIT): Promise<SearchSyncRetryResult> {
      if (!enabled) {
        const counts = await dependencies.jobRepository.countByProvider(providerKey)
        return { claimed: 0, succeeded: 0, failed: 0, dead: counts.dead, pending: counts.pending }
      }
      const limit = Math.max(1, Math.min(MAX_BATCH_LIMIT, Math.trunc(requestedLimit)))
      const startedAt = now()
      const ownerToken = generateOwnerToken()
      const jobs = await dependencies.jobRepository.claim({
        providerKey,
        ownerToken,
        limit,
        now: startedAt,
        lockedUntil: new Date(startedAt.getTime() + leaseMs)
      })

      let succeeded = 0
      let failed = 0
      for (const job of jobs) {
        try {
          await apply(job)
          if (await dependencies.jobRepository.complete({
            id: job.id,
            ownerToken,
            revision: job.revision
          })) {
            succeeded += 1
          }
        } catch {
          const attemptCount = job.attemptCount + 1
          const exhausted = attemptCount >= maxAttempts
          const failedAt = now()
          const delayMs = job.operation === 'remove'
            ? retryDelayMs(attemptCount, removeBaseDelayMs, removeMaxDelayMs)
            : retryDelayMs(attemptCount, baseDelayMs, maxDelayMs)
          const updated = await dependencies.jobRepository.fail({
            id: job.id,
            ownerToken,
            revision: job.revision,
            attemptCount,
            status: exhausted ? 'dead' : 'pending',
            availableAt: exhausted
              ? failedAt
              : new Date(failedAt.getTime() + delayMs),
            lastError: exhausted
              ? 'Search synchronization exhausted automatic retries'
              : 'Search synchronization failed and will retry',
            updatedAt: failedAt
          })
          if (updated) failed += 1
        }
      }

      const counts = await dependencies.jobRepository.countByProvider(providerKey)
      if (counts.dead > 0) {
        await dependencies.healthReporter.markDead(providerKey, counts.dead)
      } else if (counts.pending > 0) {
        await dependencies.healthReporter.markRetrying(providerKey, counts.pending)
      } else if (jobs.length > 0) {
        await dependencies.healthReporter.markHealthy(providerKey)
      }

      return {
        claimed: jobs.length,
        succeeded,
        failed,
        dead: counts.dead,
        pending: counts.pending
      }
    }
  }
}

export type SearchSyncRetryService = ReturnType<typeof createSearchSyncRetryService>
