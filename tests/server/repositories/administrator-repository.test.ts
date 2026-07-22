import { createAdministratorRepository } from '../../../server/repositories/administrator-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

type TestSqlite = ReturnType<typeof createSqliteTestDatabase>['sqlite']

function countAdministrators(sqlite: TestSqlite): number {
  const row = sqlite.prepare('SELECT COUNT(*) AS count FROM administrators').get() as { count: number }
  return row.count
}

function newAdministrator(id: string, username: string) {
  return {
    id,
    username,
    passwordHash: `hash-${id}`,
    createdAt: new Date('2026-06-27T00:00:00.000Z'),
    updatedAt: new Date('2026-06-27T00:00:00.000Z')
  }
}

describe('administrator repository', () => {
  it('reports whether any administrator exists', async () => {
    const { db, sqlite } = createSqliteTestDatabase()
    const repository = createAdministratorRepository(db as never)

    await expect(repository.hasAnyAdministrator()).resolves.toBe(false)

    await repository.createFirst(newAdministrator('admin-1', 'admin'))

    await expect(repository.hasAnyAdministrator()).resolves.toBe(true)
    expect(countAdministrators(sqlite)).toBe(1)
  })

  it('creates the first administrator and returns the public record', async () => {
    const { db } = createSqliteTestDatabase()
    const repository = createAdministratorRepository(db as never)

    await expect(repository.createFirst(newAdministrator('admin-1', 'admin')))
      .resolves.toEqual({ id: 'admin-1', username: 'admin' })
  })

  it('refuses a second administrator even with a different username', async () => {
    const { db, sqlite } = createSqliteTestDatabase()
    const repository = createAdministratorRepository(db as never)

    await repository.createFirst(newAdministrator('admin-1', 'admin'))

    await expect(repository.createFirst(newAdministrator('admin-2', 'second')))
      .resolves.toBeNull()
    expect(countAdministrators(sqlite)).toBe(1)
  })

  it('creates at most one administrator when setup attempts overlap', async () => {
    const { db, sqlite } = createSqliteTestDatabase()
    const repository = createAdministratorRepository(db as never)

    const results = await Promise.all([
      repository.createFirst(newAdministrator('admin-1', 'admin-one')),
      repository.createFirst(newAdministrator('admin-2', 'admin-two'))
    ])

    expect(results.filter((result) => result !== null)).toHaveLength(1)
    expect(countAdministrators(sqlite)).toBe(1)
  })
})
