import { createAdminSecurityRepository } from '../../../server/repositories/admin-security-repository'
import { createAdministratorRepository } from '../../../server/repositories/administrator-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

async function setup(options: { failBatchAfter?: number } = {}) {
  const { db, sqlite } = createSqliteTestDatabase()
  let failBatchAfter = options.failBatchAfter
  const d1CompatibleDb = Object.assign(db, {
    async batch(statements: Array<{ all(): unknown }>) {
      return sqlite.transaction((items: Array<{ all(): unknown }>) => items.map((statement, index) => {
        let result: unknown
        try {
          result = statement.all()
        } catch (error) {
          if (!(error instanceof TypeError) || !error.message.includes('does not return data')) throw error
          result = (statement as unknown as { run(): unknown }).run()
        }
        if (failBatchAfter === index + 1) throw new Error('injected batch failure')
        return result
      }))(statements)
    }
  })
  const administratorRepository = createAdministratorRepository(d1CompatibleDb as never)
  await administratorRepository.create({
    id: 'admin-1',
    username: 'owner',
    passwordHash: 'hash',
    createdAt: new Date('2026-07-17T00:00:00Z'),
    updatedAt: new Date('2026-07-17T00:00:00Z')
  })
  return {
    repository: createAdminSecurityRepository(d1CompatibleDb as never),
    sqlite,
    setFailBatchAfter(value: number | undefined) {
      failBatchAfter = value
    }
  }
}

describe('admin security repository', () => {
  it('persists pending, enabled, and disabled two-factor state', async () => {
    const { repository } = await setup()
    const now = new Date('2026-07-17T01:00:00Z')

    await repository.savePendingTwoFactor({
      adminId: 'admin-1', secretCiphertext: 'cipher', secretIv: 'iv', now
    })
    await expect(repository.getTwoFactor('admin-1')).resolves.toMatchObject({
      secretCiphertext: 'cipher', secretIv: 'iv', enabledAt: null
    })

    await repository.enableTwoFactor({
      adminId: 'admin-1',
      enabledAt: now,
      recoveryCodes: [{ id: 'code-1', codeHash: 'hash-1' }]
    })
    await expect(repository.getTwoFactor('admin-1')).resolves.toMatchObject({ enabledAt: now })
    await repository.disableTwoFactor('admin-1', now)
    await expect(repository.getTwoFactor('admin-1')).resolves.toMatchObject({
      secretCiphertext: null, secretIv: null, enabledAt: null
    })
  })

  it('replaces exact IP rules atomically', async () => {
    const { repository } = await setup()
    const now = new Date('2026-07-17T01:00:00Z')
    await repository.replaceIpRules({
      adminId: 'admin-1', now,
      rules: [
        { id: 'allow-1', type: 'allow', ipAddress: '192.0.2.1' },
        { id: 'deny-1', type: 'deny', ipAddress: '198.51.100.1' }
      ]
    })
    await expect(repository.listIpRules()).resolves.toEqual([
      { id: 'allow-1', type: 'allow', ipAddress: '192.0.2.1', createdAt: now },
      { id: 'deny-1', type: 'deny', ipAddress: '198.51.100.1', createdAt: now }
    ])

    await repository.replaceIpRules({ adminId: 'admin-1', now, rules: [] })
    await expect(repository.listIpRules()).resolves.toEqual([])
  })

  it('chunks large IP rule inserts while preserving one atomic D1 batch', async () => {
    const { repository, sqlite, setFailBatchAfter } = await setup()
    const now = new Date('2026-07-17T01:00:00Z')
    const rules = Array.from({ length: 41 }, (_, index) => ({
      id: `allow-${index}`,
      type: 'allow' as const,
      ipAddress: `192.0.2.${index + 1}`
    }))

    await repository.replaceIpRules({ adminId: 'admin-1', now, rules })
    expect(sqlite.prepare('select count(*) as count from administrator_ip_rules').get()).toEqual({ count: 41 })

    setFailBatchAfter(2)
    await expect(repository.replaceIpRules({
      adminId: 'admin-1', now,
      rules: [{ id: 'replacement', type: 'deny', ipAddress: '198.51.100.1' }]
    })).rejects.toThrow('injected batch failure')
    expect(sqlite.prepare('select count(*) as count from administrator_ip_rules').get()).toEqual({ count: 41 })
  })

  it('lists login attempts newest-first and performs bounded retention cleanup', async () => {
    const { repository } = await setup()
    await repository.recordLoginAttempt({
      id: 'old', adminId: null, username: 'owner', ipAddress: '192.0.2.1',
      successful: false, failureReason: 'invalid_credentials', createdAt: new Date('2026-01-01T00:00:00Z')
    })
    await repository.recordLoginAttempt({
      id: 'new', adminId: 'admin-1', username: 'owner', ipAddress: '192.0.2.1',
      successful: true, failureReason: null, createdAt: new Date('2026-07-17T00:00:00Z')
    })

    const cutoff = new Date('2026-04-01T00:00:00Z')
    await expect(repository.listLoginAttempts({ offset: 0, limit: 10, cutoff })).resolves.toMatchObject({
      total: 1,
      items: [{ id: 'new' }]
    })
    await repository.deleteLoginAttemptsBefore(cutoff, 1)
    await expect(repository.listLoginAttempts({ offset: 0, limit: 10, cutoff })).resolves.toMatchObject({
      total: 1,
      items: [{ id: 'new' }]
    })
  })

  it('loads bounded throttle failures independently by IP and normalized username', async () => {
    const { repository } = await setup()
    const attempts = [
      ['ip-match', 'other', '192.0.2.1', 'invalid_credentials', '2026-07-17T00:01:00Z'],
      ['user-match', 'owner', '198.51.100.1', 'invalid_two_factor', '2026-07-17T00:02:00Z'],
      ['handshake', 'owner', '192.0.2.1', 'two_factor_required', '2026-07-17T00:03:00Z'],
      ['expired', 'owner', '192.0.2.1', 'invalid_credentials', '2026-07-16T23:00:00Z']
    ] as const
    for (const [id, username, ipAddress, failureReason, createdAt] of attempts) {
      await repository.recordLoginAttempt({
        id,
        adminId: null,
        username,
        ipAddress,
        successful: false,
        failureReason,
        createdAt: new Date(createdAt)
      })
    }

    await expect(repository.getRecentLoginFailures({
      ipAddress: '192.0.2.1',
      username: 'owner',
      cutoff: new Date('2026-07-17T00:00:00Z'),
      limit: 5
    })).resolves.toEqual({
      ipAddress: [new Date('2026-07-17T00:01:00Z')],
      username: [new Date('2026-07-17T00:02:00Z')]
    })
  })

  it('atomically reserves only five concurrent login slots and recovers after the window', async () => {
    const { repository } = await setup()
    const createdAt = new Date('2026-07-17T02:00:00Z')
    const reserve = (id: string, at = createdAt) => repository.reserveLoginAttempt({
      attempt: {
        id,
        adminId: null,
        username: 'owner',
        ipAddress: '192.0.2.1',
        successful: false,
        failureReason: null,
        createdAt: at
      },
      cutoff: new Date(at.getTime() - 15 * 60 * 1000),
      maximumFailures: 5
    })

    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => reserve(`slot-${index}`)))
    expect(results.filter(Boolean)).toHaveLength(5)

    const afterWindow = new Date(createdAt.getTime() + 16 * 60 * 1000)
    await expect(reserve('slot-after-window', afterWindow)).resolves.toBe(true)
  })

  it('updates credentials and revokes other sessions in one atomic batch', async () => {
    const { repository, sqlite } = await setup()
    sqlite.exec(`
      insert into sessions (id, admin_id, token_hash, expires_at) values
        ('current', 'admin-1', 'current-hash', 2000000000000),
        ('other', 'admin-1', 'other-hash', 2000000000000)
    `)

    await repository.updateCredentialsAndDeleteOtherSessions({
      adminId: 'admin-1',
      username: 'renamed',
      passwordHash: 'new-hash',
      currentTokenHash: 'current-hash',
      updatedAt: new Date('2026-07-17T02:00:00Z')
    })

    expect(sqlite.prepare('select username, password_hash from administrators').get())
      .toEqual({ username: 'renamed', password_hash: 'new-hash' })
    expect(sqlite.prepare('select token_hash from sessions').all())
      .toEqual([{ token_hash: 'current-hash' }])
  })

  it('rolls back a credential change when session revocation fails', async () => {
    const { repository, sqlite } = await setup({ failBatchAfter: 1 })
    sqlite.exec(`
      insert into sessions (id, admin_id, token_hash, expires_at)
      values ('other', 'admin-1', 'other-hash', 2000000000000)
    `)

    await expect(repository.updateCredentialsAndDeleteOtherSessions({
      adminId: 'admin-1',
      passwordHash: 'new-hash',
      currentTokenHash: 'current-hash',
      updatedAt: new Date('2026-07-17T02:00:00Z')
    })).rejects.toThrow('injected batch failure')

    expect(sqlite.prepare('select password_hash from administrators').get())
      .toEqual({ password_hash: 'hash' })
    expect(sqlite.prepare('select token_hash from sessions').all())
      .toEqual([{ token_hash: 'other-hash' }])
  })

  it('consumes a recovery code and creates exactly one audited session under concurrent reuse', async () => {
    const { repository, sqlite } = await setup()
    const now = new Date('2026-07-17T02:00:00Z')
    await repository.savePendingTwoFactor({
      adminId: 'admin-1', secretCiphertext: 'cipher', secretIv: 'iv', now
    })
    await repository.enableTwoFactor({
      adminId: 'admin-1', enabledAt: now,
      recoveryCodes: [{ id: 'recovery-1', codeHash: 'recovery-hash' }]
    })

    for (const id of ['one', 'two']) {
      await repository.reserveLoginAttempt({
        attempt: {
          id: `attempt-${id}`, adminId: null, username: 'owner', ipAddress: '192.0.2.1',
          successful: false, failureReason: null, createdAt: now
        },
        cutoff: new Date(now.getTime() - 15 * 60 * 1000),
        maximumFailures: 5
      })
    }

    const attempt = (id: string) => repository.consumeRecoveryCodeAndCreateSessionAndCompleteLoginAttempt({
      adminId: 'admin-1',
      codeHash: 'recovery-hash',
      session: {
        id: `session-${id}`, adminId: 'admin-1', tokenHash: `token-${id}`,
        expiresAt: new Date('2026-07-18T02:00:00Z'), createdAt: now
      },
      attemptId: `attempt-${id}`,
      username: 'owner'
    })
    const results = await Promise.all([attempt('one'), attempt('two')])

    expect(results.filter(Boolean)).toHaveLength(1)
    expect(sqlite.prepare('select id from sessions').all()).toHaveLength(1)
    expect(sqlite.prepare('select id from administrator_login_attempts').all()).toHaveLength(2)
    expect(sqlite.prepare('select id from administrator_login_attempts where successful = 1').all()).toHaveLength(1)
    expect(sqlite.prepare('select id from administrator_recovery_codes').all()).toHaveLength(0)
  })

  it('does not consume a recovery code when the reserved session insert did not run', async () => {
    const { repository, sqlite } = await setup()
    const now = new Date('2026-07-17T02:00:00Z')
    await repository.savePendingTwoFactor({
      adminId: 'admin-1', secretCiphertext: 'cipher', secretIv: 'iv', now
    })
    await repository.enableTwoFactor({
      adminId: 'admin-1', enabledAt: now,
      recoveryCodes: [{ id: 'recovery-1', codeHash: 'recovery-hash' }]
    })
    const created = await repository.consumeRecoveryCodeAndCreateSessionAndCompleteLoginAttempt({
      adminId: 'admin-1',
      codeHash: 'recovery-hash',
      session: {
        id: 'session-missing', adminId: 'admin-1', tokenHash: 'token-missing',
        expiresAt: new Date('2026-07-18T02:00:00Z'), createdAt: now
      },
      attemptId: 'attempt-missing',
      username: 'owner'
    })

    expect(created).toBe(false)
    expect(sqlite.prepare('select id from sessions').all()).toEqual([])
    expect(sqlite.prepare('select id from administrator_login_attempts').all()).toEqual([])
    expect(sqlite.prepare('select id from administrator_recovery_codes').all())
      .toEqual([{ id: 'recovery-1' }])
  })

  it('rolls back recovery-code 2FA disablement when the batch fails', async () => {
    const { repository, sqlite, setFailBatchAfter } = await setup()
    const now = new Date('2026-07-17T02:00:00Z')
    await repository.savePendingTwoFactor({
      adminId: 'admin-1', secretCiphertext: 'cipher', secretIv: 'iv', now
    })
    await repository.enableTwoFactor({
      adminId: 'admin-1', enabledAt: now,
      recoveryCodes: [{ id: 'recovery-1', codeHash: 'recovery-hash' }]
    })
    setFailBatchAfter(1)

    await expect(repository.consumeRecoveryCodeAndDisableTwoFactor({
      adminId: 'admin-1', codeHash: 'recovery-hash', now
    })).rejects.toThrow('injected batch failure')

    expect(sqlite.prepare(`
      select two_factor_secret_ciphertext, two_factor_enabled_at
      from administrator_security where admin_id = 'admin-1'
    `).get()).toEqual({
      two_factor_secret_ciphertext: 'cipher',
      two_factor_enabled_at: now.getTime()
    })
    expect(sqlite.prepare('select code_hash from administrator_recovery_codes').all())
      .toEqual([{ code_hash: 'recovery-hash' }])
  })
})
