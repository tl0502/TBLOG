import { createHealthRepository } from '../../../server/repositories/health-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

describe('health repository', () => {
  it('probes the configured database without reading application rows', async () => {
    const { db } = createSqliteTestDatabase()

    await expect(createHealthRepository(db as never).probe()).resolves.toBeUndefined()
  })

  it('propagates database reachability failures', async () => {
    const failure = new Error('D1 unavailable')
    const repository = createHealthRepository({
      run: vi.fn().mockRejectedValue(failure)
    } as never)

    await expect(repository.probe()).rejects.toBe(failure)
  })
})
