import { createSearchSyncJobRepository } from '../../../server/repositories/search-sync-job-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

function setup() {
  const { db, sqlite } = createSqliteTestDatabase()
  return { repository: createSearchSyncJobRepository(db as never), sqlite }
}

const at = (value: string) => new Date(value)

describe('search sync job repository', () => {
  it('coalesces to the newest desired operation and invalidates an older lease revision', async () => {
    const { repository, sqlite } = setup()
    const now = at('2026-07-16T00:00:00.000Z')
    await repository.enqueue({
      providerKey: 'algolia', postId: 'p1', operation: 'upsert', availableAt: now, updatedAt: now
    })
    const [claimed] = await repository.claim({
      providerKey: 'algolia', ownerToken: 'worker-1', limit: 1, now,
      lockedUntil: at('2026-07-16T00:01:00.000Z')
    })

    await repository.enqueue({
      providerKey: 'algolia', postId: 'p1', operation: 'remove',
      availableAt: at('2026-07-16T00:00:01.000Z'), updatedAt: at('2026-07-16T00:00:01.000Z')
    })

    expect(await repository.complete({
      id: claimed.id, ownerToken: 'worker-1', revision: claimed.revision
    })).toBe(false)
    await repository.clearPost('algolia', 'p1', 'upsert')
    const row = sqlite.prepare(`
      SELECT operation, status, attempt_count AS attemptCount, revision, lease_owner AS leaseOwner
      FROM search_sync_jobs WHERE provider_key = 'algolia' AND post_id = 'p1'
    `).get() as Record<string, unknown>
    expect(row).toMatchObject({
      operation: 'remove', status: 'pending', attemptCount: 0, revision: 2, leaseOwner: null
    })
  })

  it('claims a bounded batch once and recovers it after lease expiry', async () => {
    const { repository } = setup()
    const now = at('2026-07-16T00:00:00.000Z')
    for (const postId of ['p1', 'p2']) {
      await repository.enqueue({ providerKey: 'algolia', postId, operation: 'upsert', availableAt: now, updatedAt: now })
    }

    const first = await repository.claim({
      providerKey: 'algolia', ownerToken: 'worker-1', limit: 1, now,
      lockedUntil: at('2026-07-16T00:01:00.000Z')
    })
    const second = await repository.claim({
      providerKey: 'algolia', ownerToken: 'worker-2', limit: 2, now,
      lockedUntil: at('2026-07-16T00:01:00.000Z')
    })
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)

    const recovered = await repository.claim({
      providerKey: 'algolia', ownerToken: 'worker-3', limit: 2,
      now: at('2026-07-16T00:01:01.000Z'),
      lockedUntil: at('2026-07-16T00:02:01.000Z')
    })
    expect(recovered).toHaveLength(2)
    expect(recovered.every((job) => job.leaseOwner === 'worker-3')).toBe(true)
  })

  it('records retry and dead states, counts them, and clears provider jobs', async () => {
    const { repository } = setup()
    const now = at('2026-07-16T00:00:00.000Z')
    for (const postId of ['p1', 'p2']) {
      await repository.enqueue({ providerKey: 'algolia', postId, operation: 'upsert', availableAt: now, updatedAt: now })
    }
    const jobs = await repository.claim({
      providerKey: 'algolia', ownerToken: 'worker', limit: 2, now,
      lockedUntil: at('2026-07-16T00:01:00.000Z')
    })
    await repository.fail({
      id: jobs[0].id, ownerToken: 'worker', revision: jobs[0].revision, attemptCount: 1,
      status: 'pending', availableAt: at('2026-07-16T00:02:00.000Z'), lastError: 'retry', updatedAt: now
    })
    await repository.fail({
      id: jobs[1].id, ownerToken: 'worker', revision: jobs[1].revision, attemptCount: 8,
      status: 'dead', availableAt: now, lastError: 'dead', updatedAt: now
    })

    expect(await repository.countByProvider('algolia')).toEqual({ pending: 1, dead: 1 })
    await repository.clearPost('algolia', 'p1', 'upsert')
    expect(await repository.countByProvider('algolia')).toEqual({ pending: 0, dead: 1 })
    await repository.clearProvider('algolia')
    expect(await repository.countByProvider('algolia')).toEqual({ pending: 0, dead: 0 })
  })
})
