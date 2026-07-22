import { createSearchSyncRetryService, retryDelayMs } from '../../../server/services/search-sync-retry-service'
import type { SearchSyncJob } from '../../../server/repositories/contracts/search-sync-repositories'

const NOW = new Date('2026-07-16T00:00:00.000Z')

function job(overrides: Partial<SearchSyncJob> = {}): SearchSyncJob {
  return {
    id: 'j1', providerKey: 'algolia', postId: 'p1', operation: 'upsert', status: 'pending',
    attemptCount: 0, revision: 1, availableAt: NOW, leaseOwner: 'owner', lockedUntil: NOW,
    lastError: null, createdAt: NOW, updatedAt: NOW, ...overrides
  }
}

function setup(options: {
  jobs?: SearchSyncJob[]
  record?: Record<string, unknown> | null
  providerFails?: boolean
  completeResult?: boolean
  counts?: { pending: number; dead: number }
  maxAttempts?: number
  enabled?: boolean
  removeBaseDelayMs?: number
  removeMaxDelayMs?: number
} = {}) {
  const jobs = options.jobs ?? [job()]
  const calls = {
    indexed: [] as unknown[], removed: [] as string[], completed: [] as unknown[], failed: [] as any[],
    claimed: [] as any[], healthy: 0, retrying: [] as number[], dead: [] as number[], queueUnavailable: 0
  }
  const service = createSearchSyncRetryService({
    jobRepository: {
      async enqueue() {},
      async claim(input) { calls.claimed.push(input); return jobs },
      async complete(input) { calls.completed.push(input); return options.completeResult ?? true },
      async fail(input) { calls.failed.push(input); return true },
      async clearPost() {}, async clearProvider() {},
      async countByProvider() { return options.counts ?? { pending: 0, dead: 0 } }
    },
    searchRecordSource: {
      async getSearchRecord() {
        return options.record === null ? null : (options.record ?? {
          objectID: 'p1', title: 'P1', slug: 'p1', excerpt: null, body: '', category: null, tags: [], publishedAt: 1
        }) as never
      }
    },
    searchProvider: options.providerFails ? {
      async indexRecord() { throw new Error('down') },
      async removeRecord() { throw new Error('down') },
      async replaceAllRecords() {}
    } : {
      async indexRecord(record) { calls.indexed.push(record) },
      async removeRecord(id) { calls.removed.push(id) },
      async replaceAllRecords() {}
    },
    enabled: options.enabled,
    healthReporter: {
      async markHealthy() { calls.healthy += 1 },
      async markRetrying(_provider, count) { calls.retrying.push(count) },
      async markDead(_provider, count) { calls.dead.push(count) },
      async markQueueUnavailable() { calls.queueUnavailable += 1 }
    },
    now: () => NOW,
    generateOwnerToken: () => 'owner',
    maxAttempts: options.maxAttempts,
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
    removeBaseDelayMs: options.removeBaseDelayMs,
    removeMaxDelayMs: options.removeMaxDelayMs
  })
  return { service, calls }
}

describe('search sync retry service', () => {
  it('indexes current public records and completes the claimed revision', async () => {
    const { service, calls } = setup()
    await expect(service.processBatch()).resolves.toEqual({ claimed: 1, succeeded: 1, failed: 0, dead: 0, pending: 0 })
    expect(calls.indexed).toHaveLength(1)
    expect(calls.completed).toEqual([{ id: 'j1', ownerToken: 'owner', revision: 1 }])
    expect(calls.healthy).toBe(1)
  })

  it('converges a stale upsert to remove when the post is no longer public', async () => {
    const { service, calls } = setup({ record: null })
    await service.processBatch()
    expect(calls.removed).toEqual(['p1'])
    expect(calls.indexed).toEqual([])
  })

  it('applies explicit remove jobs without reading an index record', async () => {
    const { service, calls } = setup({ jobs: [job({ operation: 'remove' })] })
    await service.processBatch()
    expect(calls.removed).toEqual(['p1'])
  })

  it('backs off retryable failures and reports pending health', async () => {
    const { service, calls } = setup({ providerFails: true, counts: { pending: 1, dead: 0 } })
    const result = await service.processBatch()
    expect(result).toEqual({ claimed: 1, succeeded: 0, failed: 1, dead: 0, pending: 1 })
    expect(calls.failed[0]).toMatchObject({ attemptCount: 1, status: 'pending' })
    expect(calls.failed[0].availableAt).toEqual(new Date(NOW.getTime() + 1_000))
    expect(calls.retrying).toEqual([1])
  })

  it('retries public record removals on a shorter bounded schedule', async () => {
    const { service, calls } = setup({
      jobs: [job({ operation: 'remove' })],
      providerFails: true,
      counts: { pending: 1, dead: 0 },
      removeBaseDelayMs: 250,
      removeMaxDelayMs: 1_000
    })

    await service.processBatch()

    expect(calls.failed[0].availableAt).toEqual(new Date(NOW.getTime() + 250))
  })

  it('marks exhausted jobs dead', async () => {
    const { service, calls } = setup({
      jobs: [job({ attemptCount: 1 })], providerFails: true, maxAttempts: 2,
      counts: { pending: 0, dead: 1 }
    })
    await service.processBatch()
    expect(calls.failed[0]).toMatchObject({ attemptCount: 2, status: 'dead' })
    expect(calls.dead).toEqual([1])
  })

  it('caps exponential retry delay', () => {
    expect(retryDelayMs(1, 1_000, 10_000)).toBe(1_000)
    expect(retryDelayMs(4, 1_000, 10_000)).toBe(8_000)
    expect(retryDelayMs(8, 1_000, 10_000)).toBe(10_000)
  })

  it('caps direct callers at twenty jobs per invocation', async () => {
    const { service, calls } = setup()

    await service.processBatch(25)

    expect(calls.claimed[0]).toMatchObject({ limit: 20 })
  })

  it('does not consume retry attempts while the integration is disabled', async () => {
    const { service, calls } = setup({ enabled: false, counts: { pending: 1, dead: 0 } })
    await expect(service.processBatch()).resolves.toEqual({
      claimed: 0, succeeded: 0, failed: 0, dead: 0, pending: 1
    })
    expect(calls.indexed).toEqual([])
    expect(calls.failed).toEqual([])
  })
})
