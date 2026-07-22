import { createAuthService } from '../../../server/services/auth-service'
import type {
  AdministratorSessionRecord,
  NewAdministratorRecord,
  NewAdministratorSessionRecord
} from '../../../server/domain/auth'
import type {
  AdministratorRepository,
  PublicAdministrator,
  SessionRepository,
  SessionWithAdministrator
} from '../../../server/repositories/contracts/auth-repositories'

const sessionSecret = '0123456789abcdef0123456789abcdef'

function createFakeRepositories() {
  const administrators = new Map<string, PublicAdministrator & { passwordHash: string }>()
  const sessions = new Map<string, AdministratorSessionRecord>()
  let createFirstQueue = Promise.resolve()

  function storeAdministrator(input: NewAdministratorRecord) {
    const admin = {
      id: input.id,
      username: input.username,
      passwordHash: input.passwordHash
    }
    administrators.set(admin.id, admin)
    return { id: admin.id, username: admin.username }
  }

  const administratorRepository: AdministratorRepository = {
    async hasAnyAdministrator() {
      return administrators.size > 0
    },
    async findById(id) {
      const admin = administrators.get(id)
      return admin ? { id: admin.id, username: admin.username } : null
    },
    async findByIdWithPassword(id) {
      return administrators.get(id) ?? null
    },
    async findByUsername(username) {
      const admin = Array.from(administrators.values()).find((candidate) => candidate.username === username)
      return admin
        ? {
            id: admin.id,
            username: admin.username,
            passwordHash: admin.passwordHash
          }
        : null
    },
    async create(input: NewAdministratorRecord) {
      return storeAdministrator(input)
    },
    async createFirst(input: NewAdministratorRecord) {
      let releaseCreateFirst: () => void = () => {}
      const previousCreateFirst = createFirstQueue
      createFirstQueue = new Promise((resolve) => {
        releaseCreateFirst = resolve
      })

      await previousCreateFirst

      try {
        return administrators.size > 0 ? null : storeAdministrator(input)
      } finally {
        releaseCreateFirst()
      }
    },
    async updateCredentials(input) {
      const admin = administrators.get(input.id)!
      const updated = {
        ...admin,
        username: input.username ?? admin.username,
        passwordHash: input.passwordHash ?? admin.passwordHash
      }
      administrators.set(input.id, updated)
      return { id: updated.id, username: updated.username }
    }
  }

  const sessionRepository: SessionRepository = {
    async create(input: NewAdministratorSessionRecord) {
      const session = {
        id: input.id,
        adminId: input.adminId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: input.createdAt ?? new Date()
      }
      sessions.set(session.tokenHash, session)
      return session
    },
    async findByTokenHash(tokenHash, now) {
      const session = sessions.get(tokenHash)
      if (!session || session.expiresAt <= now) {
        return null
      }

      const admin = administrators.get(session.adminId)
      if (!admin) {
        return null
      }

      return {
        ...session,
        administrator: {
          id: admin.id,
          username: admin.username
        }
      } satisfies SessionWithAdministrator
    },
    async deleteByTokenHash(tokenHash) {
      sessions.delete(tokenHash)
    },
    async deleteExpired(now) {
      for (const [tokenHash, session] of sessions.entries()) {
        if (session.expiresAt <= now) {
          sessions.delete(tokenHash)
        }
      }
    }
  }

  return { administratorRepository, administrators, sessionRepository, sessions }
}

describe('auth service', () => {
  it('reports setup required before an administrator exists', async () => {
    const repositories = createFakeRepositories()
    const service = createAuthService({ ...repositories, sessionSecret })

    await expect(service.getSetupStatus()).resolves.toEqual({ required: true })
  })

  it('creates the first administrator and a session', async () => {
    const repositories = createFakeRepositories()
    const service = createAuthService({ ...repositories, sessionSecret })

    const result = await service.setupAdministrator({
      username: 'admin',
      password: 'correct horse battery staple'
    })

    expect(result.administrator.username).toBe('admin')
    expect(result.sessionToken).toHaveLength(43)
    await expect(service.getSetupStatus()).resolves.toEqual({ required: false })
  })

  it('does not create an administrator when the session secret is missing', async () => {
    const repositories = createFakeRepositories()
    const service = createAuthService({ ...repositories, sessionSecret: '' })

    await expect(
      service.setupAdministrator({ username: 'admin', password: 'correct horse battery staple' })
    ).rejects.toMatchObject({ code: 'missing_session_secret', statusCode: 500 })
    await expect(service.getSetupStatus()).resolves.toEqual({ required: true })
  })

  it('rejects weak or placeholder session secrets before creating an administrator', async () => {
    for (const weakSecret of [
      'short-secret',
      'replace-with-a-local-development-secret-at-least-32-characters',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    ]) {
      const repositories = createFakeRepositories()
      const service = createAuthService({ ...repositories, sessionSecret: weakSecret })
      await expect(service.setupAdministrator({
        username: 'admin', password: 'correct horse battery staple'
      })).rejects.toMatchObject({ code: 'invalid_session_secret', statusCode: 500 })
      expect(repositories.administrators).toHaveLength(0)
    }
  })

  it('rejects a weak session secret before reading credentials during login', async () => {
    const repositories = createFakeRepositories()
    const setupService = createAuthService({ ...repositories, sessionSecret })
    await setupService.setupAdministrator({
      username: 'admin', password: 'correct horse battery staple'
    })
    const credentialLookup = vi.spyOn(repositories.administratorRepository, 'findByUsername')
    const weakService = createAuthService({ ...repositories, sessionSecret: 'short-secret' })

    await expect(weakService.login({
      username: 'admin', password: 'correct horse battery staple'
    })).rejects.toMatchObject({ code: 'invalid_session_secret', statusCode: 500 })
    expect(credentialLookup).not.toHaveBeenCalled()
  })

  it('blocks setup after an administrator exists', async () => {
    const repositories = createFakeRepositories()
    const service = createAuthService({ ...repositories, sessionSecret })

    await service.setupAdministrator({ username: 'admin', password: 'correct horse battery staple' })

    await expect(
      service.setupAdministrator({ username: 'second', password: 'correct horse battery staple' })
    ).rejects.toMatchObject({ code: 'setup_already_completed', statusCode: 409 })
  })

  it('allows only one administrator when setup requests overlap', async () => {
    const repositories = createFakeRepositories()
    const service = createAuthService({ ...repositories, sessionSecret })

    const results = await Promise.allSettled([
      service.setupAdministrator({ username: 'admin-one', password: 'correct horse battery staple' }),
      service.setupAdministrator({ username: 'admin-two', password: 'correct horse battery staple' })
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(repositories.administrators).toHaveLength(1)
  })

  it('logs in with valid credentials and rejects invalid credentials', async () => {
    const repositories = createFakeRepositories()
    const service = createAuthService({ ...repositories, sessionSecret })

    await service.setupAdministrator({ username: 'admin', password: 'correct horse battery staple' })

    await expect(service.login({ username: 'admin', password: 'correct horse battery staple' }))
      .resolves.toMatchObject({ administrator: { username: 'admin' } })

    await expect(service.login({ username: 'admin', password: 'wrong' }))
      .rejects.toMatchObject({ code: 'invalid_credentials', statusCode: 401 })
  })

  it('loads the current administrator and permissions from a valid session', async () => {
    const repositories = createFakeRepositories()
    const service = createAuthService({ ...repositories, sessionSecret })
    const setup = await service.setupAdministrator({
      username: 'admin',
      password: 'correct horse battery staple'
    })

    await expect(service.getCurrentAdministrator(setup.sessionToken))
      .resolves.toMatchObject({
        administrator: { username: 'admin' },
        permissions: expect.arrayContaining(['post:*', 'settings:*'])
      })
    await expect(service.requirePermission(setup.sessionToken, 'post:*'))
      .resolves.toMatchObject({ administrator: { username: 'admin' } })
  })

  it('deletes the current session during logout', async () => {
    const repositories = createFakeRepositories()
    const service = createAuthService({ ...repositories, sessionSecret })
    const setup = await service.setupAdministrator({
      username: 'admin',
      password: 'correct horse battery staple'
    })

    await expect(service.getCurrentAdministrator(setup.sessionToken))
      .resolves.toMatchObject({ administrator: { username: 'admin' } })

    await service.logout(setup.sessionToken)

    await expect(service.getCurrentAdministrator(setup.sessionToken))
      .rejects.toMatchObject({ code: 'unauthorized', statusCode: 401 })
  })
})
