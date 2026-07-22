import { createSearchSyncStatusReporter } from '../../../server/services/search-sync-status-reporter'

const NOW = new Date('2026-07-16T00:00:00.000Z')

function setup(options: {
  enabled?: boolean
  counts?: { pending: number; dead: number }
  enqueueFails?: boolean
} = {}) {
  const calls = {
    enqueued: [] as any[], cleared: [] as unknown[], healthy: 0, retrying: [] as number[],
    dead: [] as number[], queueUnavailable: 0
  }
  const reporter = createSearchSyncStatusReporter({
    integrationRepository: {
      async findByCapabilityAndProvider() {
        return {
          capability: 'search', providerKey: 'algolia', enabled: options.enabled ?? true,
          publicConfigJson: '{}', status: 'configured', lastCheckedAt: null, lastError: null, updatedAt: NOW
        }
      }
    } as never,
    jobRepository: {
      async enqueue(input: unknown) {
        if (options.enqueueFails) throw new Error('D1 unavailable')
        calls.enqueued.push(input)
      },
      async clearPost(providerKey: string, postId: string, operation: 'upsert' | 'remove') {
        calls.cleared.push({ providerKey, postId, operation })
      },
      async countByProvider() { return options.counts ?? { pending: 1, dead: 0 } }
    } as never,
    healthReporter: {
      async markHealthy() { calls.healthy += 1 },
      async markRetrying(_provider, count) { calls.retrying.push(count) },
      async markDead(_provider, count) { calls.dead.push(count) },
      async markQueueUnavailable() { calls.queueUnavailable += 1 }
    },
    now: () => NOW
  })
  return { reporter, calls }
}

describe('search sync status reporter', () => {
  it('enqueues the latest desired operation and reports pending retry health', async () => {
    const { reporter, calls } = setup()
    await reporter.reportFailure({ postId: 'p1', operation: 'remove' })
    expect(calls.enqueued).toEqual([{
      providerKey: 'algolia', postId: 'p1', operation: 'remove', availableAt: NOW, updatedAt: NOW
    }])
    expect(calls.retrying).toEqual([1])
  })

  it('clears a matching job after direct success without hiding other dead jobs', async () => {
    const { reporter, calls } = setup({ counts: { pending: 0, dead: 2 } })
    await reporter.reportSuccess({ postId: 'p1', operation: 'upsert' })
    expect(calls.cleared).toEqual([{ providerKey: 'algolia', postId: 'p1', operation: 'upsert' }])
    expect(calls.dead).toEqual([2])
    expect(calls.healthy).toBe(0)
  })

  it('does nothing while search is disabled', async () => {
    const { reporter, calls } = setup({ enabled: false })
    await reporter.reportFailure({ postId: 'p1', operation: 'upsert' })
    await reporter.reportSuccess({ postId: 'p1', operation: 'upsert' })
    expect(calls.enqueued).toEqual([])
    expect(calls.cleared).toEqual([])
  })

  it('keeps a visible warning when the retry job itself cannot be persisted', async () => {
    const { reporter, calls } = setup({ enqueueFails: true })
    await expect(reporter.reportFailure({ postId: 'p1', operation: 'upsert' })).rejects.toThrow('D1 unavailable')
    expect(calls.queueUnavailable).toBe(1)
  })
})
