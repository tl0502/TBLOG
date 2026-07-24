import { createAdminSecurityRepository } from '../../../server/repositories/admin-security-repository'
import { createAdministratorRepository } from '../../../server/repositories/administrator-repository'
import { createSessionRepository } from '../../../server/repositories/session-repository'
import { createAdminSecurityService } from '../../../server/services/admin-security-service'
import { createAuthService } from '../../../server/services/auth-service'
import { createTotpCode } from '../../../server/utils/admin-security-crypto'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

const now = new Date('2026-07-17T03:00:00Z')
const sessionSecret = '0123456789abcdef0123456789abcdef'
const encryptionKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(11)))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

async function setup(options: { now?: () => Date } = {}) {
  const { db } = createSqliteTestDatabase()
  const administratorRepository = createAdministratorRepository(db as never)
  const sessionRepository = createSessionRepository(db as never)
  const securityRepository = createAdminSecurityRepository(db as never)
  const auth = createAuthService({
    administratorRepository,
    sessionRepository,
    securityRepository,
    sessionSecret,
    authEncryptionKey: encryptionKey,
    now: options.now ?? (() => now)
  })
  const first = await auth.setupAdministrator({
    username: 'owner', password: 'correct horse battery staple'
  })
  const current = await auth.getCurrentAdministrator(first.sessionToken)
  const security = createAdminSecurityService({
    administratorRepository,
    securityRepository,
    sessionSecret,
    authEncryptionKey: encryptionKey,
    now: options.now ?? (() => now)
  })
  return { auth, current, first, security, securityRepository }
}

describe('admin security service', () => {
  it('updates account credentials and revokes other sessions after a password change', async () => {
    const { auth, current, first, security } = await setup()
    const other = await auth.login({ username: 'owner', password: 'correct horse battery staple' })

    await expect(security.updateAccount(current, first.sessionToken, {
      currentPassword: 'wrong', username: 'renamed'
    })).rejects.toMatchObject({ code: 'incorrect_current_password' })

    await expect(security.updateAccount(current, first.sessionToken, {
      currentPassword: 'correct horse battery staple',
      username: 'renamed',
      password: 'a newly secured password'
    })).resolves.toMatchObject({ username: 'renamed' })

    await expect(auth.getCurrentAdministrator(first.sessionToken)).resolves.toBeDefined()
    await expect(auth.getCurrentAdministrator(other.sessionToken))
      .rejects.toMatchObject({ code: 'unauthorized' })
    await expect(auth.login({ username: 'renamed', password: 'a newly secured password' }))
      .resolves.toMatchObject({ administrator: { username: 'renamed' } })
  })

  it('enrolls TOTP, requires it at login, and consumes recovery codes once', async () => {
    const { auth, current, security, securityRepository } = await setup()
    const pending = await security.startTwoFactor(current, 'correct horse battery staple')
    const code = await createTotpCode(pending.secret, now)
    const enabled = await security.enableTwoFactor(current, {
      currentPassword: 'correct horse battery staple',
      code
    })

    await expect(auth.login({ username: 'owner', password: 'correct horse battery staple' }))
      .rejects.toMatchObject({ code: 'two_factor_required' })
    await expect(auth.login({
      username: 'owner', password: 'correct horse battery staple', secondFactor: code
    })).resolves.toMatchObject({ administrator: { username: 'owner' } })

    const recoveryCode = enabled.recoveryCodes[0]
    await expect(auth.login({
      username: 'owner', password: 'correct horse battery staple', secondFactor: recoveryCode
    })).resolves.toBeDefined()
    await expect(auth.login({
      username: 'owner', password: 'correct horse battery staple', secondFactor: recoveryCode
    })).rejects.toMatchObject({ code: 'invalid_two_factor' })

    const attempts = await securityRepository.listLoginAttempts({
      offset: 0,
      limit: 20,
      cutoff: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    })
    expect(attempts.items.map((attempt) => attempt.failureReason))
      .toEqual(expect.arrayContaining(['two_factor_required', 'invalid_two_factor', null]))
  })

  it('rejects enable without the current password and keeps a late start from wiping enabled 2FA', async () => {
    const { auth, current, security, securityRepository } = await setup()
    const pending = await security.startTwoFactor(current, 'correct horse battery staple')
    const code = await createTotpCode(pending.secret, now)

    await expect(security.enableTwoFactor(current, {
      currentPassword: 'wrong password here',
      code
    })).rejects.toMatchObject({ code: 'incorrect_current_password' })

    const enabled = await security.enableTwoFactor(current, {
      currentPassword: 'correct horse battery staple',
      code
    })
    expect(enabled.recoveryCodes.length).toBeGreaterThan(0)

    await expect(security.startTwoFactor(current, 'correct horse battery staple'))
      .rejects.toMatchObject({ code: 'two_factor_not_pending' })

    // Simulate a racing savePending that loses the service-layer enabled check.
    const wiped = await securityRepository.savePendingTwoFactor({
      adminId: current.administrator.id,
      secretCiphertext: 'should-not-land',
      secretIv: 'should-not-land',
      now: new Date(now.getTime() + 1000)
    })
    expect(wiped).toBe(false)
    await expect(securityRepository.getTwoFactor(current.administrator.id))
      .resolves.toMatchObject({ enabledAt: now })
    await expect(auth.login({
      username: 'owner', password: 'correct horse battery staple', secondFactor: code
    })).resolves.toMatchObject({ administrator: { username: 'owner' } })
  })

  it('consumes a recovery code atomically while disabling two-factor authentication', async () => {
    const { auth, current, security } = await setup()
    const pending = await security.startTwoFactor(current, 'correct horse battery staple')
    const code = await createTotpCode(pending.secret, now)
    const enabled = await security.enableTwoFactor(current, {
      currentPassword: 'correct horse battery staple',
      code
    })

    await expect(security.disableTwoFactor(current, {
      currentPassword: 'correct horse battery staple',
      secondFactor: 'invalid-recovery-code'
    })).rejects.toMatchObject({ code: 'invalid_two_factor' })

    await security.disableTwoFactor(current, {
      currentPassword: 'correct horse battery staple',
      secondFactor: enabled.recoveryCodes[0]
    })

    await expect(auth.login({ username: 'owner', password: 'correct horse battery staple' }))
      .resolves.toMatchObject({ administrator: { username: 'owner' } })
  })

  it('makes failed-login audit persistence failures visible', async () => {
    const { auth, securityRepository } = await setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(securityRepository, 'reserveLoginAttempt').mockRejectedValueOnce(new Error('D1 unavailable'))

    await expect(auth.login({ username: 'owner', password: 'wrong' }))
      .rejects.toMatchObject({ code: 'login_audit_unavailable', statusCode: 503 })
  })

  it('atomically caps concurrent credential checks at five reservations', async () => {
    const { auth, securityRepository } = await setup()
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => auth.login({
      username: 'owner', password: 'wrong'
    }, { ipAddress: '198.51.100.20' })))
    const errors = results.map((result) => result.status === 'rejected'
      ? result.reason as { code?: string }
      : null)

    expect(errors.filter((error) => error?.code === 'invalid_credentials')).toHaveLength(5)
    expect(errors.filter((error) => error?.code === 'login_rate_limited')).toHaveLength(7)
    const attempts = await securityRepository.listLoginAttempts({
      offset: 0,
      limit: 20,
      cutoff: new Date(now.getTime() - 60_000)
    })
    expect(attempts.items).toHaveLength(5)
    expect(attempts.items.every((attempt) => attempt.failureReason === 'invalid_credentials')).toBe(true)
  })

  it('rate limits five recent D1-backed failures and allows login after the window expires', async () => {
    let currentTime = now
    const { auth, securityRepository } = await setup({ now: () => currentTime })
    for (let index = 0; index < 5; index += 1) {
      await securityRepository.recordLoginAttempt({
        id: `failure-${index}`,
        adminId: null,
        username: 'owner',
        ipAddress: `198.51.100.${index + 1}`,
        successful: false,
        failureReason: 'invalid_credentials',
        createdAt: new Date(currentTime.getTime() - index * 1000)
      })
    }

    await expect(auth.login({
      username: 'OWNER', password: 'correct horse battery staple'
    }, { ipAddress: '203.0.113.1' })).rejects.toMatchObject({
      code: 'login_rate_limited',
      statusCode: 429,
      details: { retryAfterSeconds: expect.any(Number) }
    })

    currentTime = new Date(now.getTime() + 16 * 60 * 1000)
    await expect(auth.login({
      username: 'owner', password: 'correct horse battery staple'
    }, { ipAddress: '203.0.113.1' })).resolves.toMatchObject({ administrator: { username: 'owner' } })
  })

  it('does not issue a session when the atomic success audit batch fails', async () => {
    const { auth, securityRepository } = await setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(securityRepository, 'createSessionAndCompleteLoginAttempt')
      .mockRejectedValueOnce(new Error('D1 unavailable'))

    await expect(auth.login({ username: 'owner', password: 'correct horse battery staple' }))
      .rejects.toMatchObject({ code: 'login_audit_unavailable', statusCode: 503 })
  })

  it('normalizes IP rules, enforces deny/default-deny, and prevents self-lockout', async () => {
    const { current, security } = await setup()
    await expect(security.replaceIpRules(current, '192.0.2.1', {
      allow: ['192.0.2.1'], deny: ['198.51.100.2']
    })).resolves.toEqual({ allow: ['192.0.2.1'], deny: ['198.51.100.2'] })

    await expect(security.assertIpAllowed('192.0.2.1')).resolves.toBeUndefined()
    await expect(security.assertIpAllowed('192.0.2.2'))
      .rejects.toMatchObject({ code: 'ip_access_denied' })
    await expect(security.replaceIpRules(current, '192.0.2.1', {
      allow: [], deny: ['192.0.2.1']
    })).rejects.toMatchObject({ code: 'ip_self_lockout' })
  })
})
