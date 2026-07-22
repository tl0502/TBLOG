import { authError } from '../domain/auth-errors'
import type { LoginFailureReason } from '../domain/admin-security'
import type {
  AdministratorRepository,
  PublicAdministrator,
  SessionRepository
} from '../repositories/contracts/auth-repositories'
import type { AdminSecurityRepository } from '../repositories/contracts/admin-security-repositories'
import {
  decryptAdminSecret,
  hashRecoveryCode,
  parseAuthEncryptionKey,
  verifyTotpCode
} from '../utils/admin-security-crypto'
import { isAdminIpAllowed } from '../utils/admin-request-ip'
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword
} from '../utils/auth-crypto'
import { getSessionSecretIssue } from '../utils/auth-runtime-secrets'
import { sessionTtlSeconds } from '../utils/session-cookie'
import { administratorPermissions, type Permission } from './permissions'

export interface AuthServiceDependencies {
  administratorRepository: AdministratorRepository
  sessionRepository: SessionRepository
  securityRepository?: AdminSecurityRepository
  sessionSecret: string
  authEncryptionKey?: string
  now?: () => Date
}

export interface AuthSessionResult {
  administrator: PublicAdministrator
  sessionToken: string
}

export interface CurrentAdministratorResult {
  administrator: PublicAdministrator
  permissions: Permission[]
}

export const loginRateLimit = {
  maximumFailures: 5,
  windowMs: 15 * 60 * 1000
} as const

function normalizeLoginUsername(username: string): string {
  return username.trim().toLowerCase()
}

function requireSessionSecret(sessionSecret: string): void {
  const issue = getSessionSecretIssue(sessionSecret)
  if (issue === 'missing') {
    throw authError('missing_session_secret', 'SESSION_SECRET is not configured', 500)
  }
  if (issue !== null) {
    throw authError(
      'invalid_session_secret',
      'SESSION_SECRET must be a random value of at least 32 bytes',
      500
    )
  }
}

export function createAuthService(dependencies: AuthServiceDependencies) {
  const now = dependencies.now ?? (() => new Date())
  const encryptionKey = parseAuthEncryptionKey(dependencies.authEncryptionKey ?? '')

  async function cleanupLoginAttempts(createdAt: Date): Promise<void> {
    if (!dependencies.securityRepository) return
    try {
      await dependencies.securityRepository.deleteLoginAttemptsBefore(
        new Date(createdAt.getTime() - 90 * 24 * 60 * 60 * 1000),
        100
      )
    } catch (error) {
      console.error('[auth-service] failed to clean up expired login attempts', error)
    }
  }

  async function reserveLoginAttempt(input: { username: string; ipAddress: string }): Promise<{
    id: string
    createdAt: Date
  } | null> {
    if (!dependencies.securityRepository) return null
    const checkedAt = now()
    const reservation = {
      id: crypto.randomUUID(),
      adminId: null,
      username: normalizeLoginUsername(input.username),
      ipAddress: input.ipAddress,
      successful: false as const,
      failureReason: null,
      createdAt: checkedAt
    }
    let reserved: boolean
    try {
      reserved = await dependencies.securityRepository.reserveLoginAttempt({
        attempt: reservation,
        cutoff: new Date(checkedAt.getTime() - loginRateLimit.windowMs),
        maximumFailures: loginRateLimit.maximumFailures
      })
    } catch (error) {
      console.error('[auth-service] failed to reserve login rate limit', error)
      throw authError(
        'login_audit_unavailable',
        'Login could not be completed because the security audit is unavailable',
        503
      )
    }
    if (reserved) return { id: reservation.id, createdAt: checkedAt }

    let failures: { ipAddress: Date[]; username: Date[] }
    try {
      failures = await dependencies.securityRepository.getRecentLoginFailures({
        ipAddress: input.ipAddress,
        username: normalizeLoginUsername(input.username),
        cutoff: new Date(checkedAt.getTime() - loginRateLimit.windowMs),
        limit: loginRateLimit.maximumFailures
      })
    } catch (error) {
      console.error('[auth-service] failed to read login rate limit', error)
      throw authError(
        'login_audit_unavailable',
        'Login could not be completed because the security audit is unavailable',
        503
      )
    }

    const blockedUntil = [failures.ipAddress, failures.username]
      .filter((items) => items.length >= loginRateLimit.maximumFailures)
      .map((items) => items[loginRateLimit.maximumFailures - 1].getTime() + loginRateLimit.windowMs)
    const latestBlockedUntil = blockedUntil.length > 0
      ? Math.max(...blockedUntil)
      : checkedAt.getTime() + 1000

    const retryAfterSeconds = Math.max(
      1,
      Math.min(
        Math.ceil((latestBlockedUntil - checkedAt.getTime()) / 1000),
        Math.ceil(loginRateLimit.windowMs / 1000)
      )
    )
    throw authError(
      'login_rate_limited',
      'Too many failed login attempts. Try again later',
      429,
      { retryAfterSeconds }
    )
  }

  async function completeFailedLoginAttempt(input: {
    reservation: { id: string; createdAt: Date } | null
    adminId: string | null
    username: string
    failureReason: LoginFailureReason
    ipAddress: string
  }): Promise<void> {
    if (!dependencies.securityRepository || !input.reservation) return
    try {
      const completed = await dependencies.securityRepository.completeLoginAttempt({
        id: input.reservation.id,
        adminId: input.adminId,
        username: normalizeLoginUsername(input.username),
        failureReason: input.failureReason
      })
      if (!completed) throw new Error('Login reservation was not found')
    } catch (error) {
      console.error('[auth-service] failed to complete login attempt', error)
      throw authError(
        'login_audit_unavailable',
        'Login could not be completed because the security audit is unavailable',
        503
      )
    }
    await cleanupLoginAttempts(input.reservation.createdAt)
  }

  async function prepareSession(adminId: string): Promise<{
    sessionToken: string
    session: {
      id: string
      adminId: string
      tokenHash: string
      expiresAt: Date
      createdAt: Date
    }
  }> {
    requireSessionSecret(dependencies.sessionSecret)

    const sessionToken = createSessionToken()
    const tokenHash = await hashSessionToken(sessionToken, dependencies.sessionSecret)
    const createdAt = now()
    const expiresAt = new Date(createdAt.getTime() + sessionTtlSeconds * 1000)

    return {
      sessionToken,
      session: { id: crypto.randomUUID(), adminId, tokenHash, expiresAt, createdAt }
    }
  }

  async function createSession(adminId: string): Promise<string> {
    const prepared = await prepareSession(adminId)
    await dependencies.sessionRepository.create(prepared.session)
    return prepared.sessionToken
  }

  async function createAuditedSession(input: {
    adminId: string
    username: string
    ipAddress: string
    reservation: { id: string; createdAt: Date } | null
  }): Promise<string> {
    const prepared = await prepareSession(input.adminId)
    if (!dependencies.securityRepository) {
      await dependencies.sessionRepository.create(prepared.session)
      return prepared.sessionToken
    }
    if (!input.reservation) {
      await dependencies.sessionRepository.create(prepared.session)
      return prepared.sessionToken
    }
    try {
      const completed = await dependencies.securityRepository.createSessionAndCompleteLoginAttempt({
        session: prepared.session,
        attemptId: input.reservation.id,
        adminId: input.adminId,
        username: normalizeLoginUsername(input.username)
      })
      if (!completed) throw new Error('Login reservation was not found')
    } catch (error) {
      console.error('[auth-service] failed to create audited login session', error)
      throw authError(
        'login_audit_unavailable',
        'Login could not be completed because the security audit is unavailable',
        503
      )
    }
    await cleanupLoginAttempts(input.reservation.createdAt)

    return prepared.sessionToken
  }

  async function getCurrentAdministrator(sessionToken: string | undefined): Promise<CurrentAdministratorResult> {
    requireSessionSecret(dependencies.sessionSecret)

    if (!sessionToken) {
      throw authError('unauthorized', 'Authentication is required', 401)
    }

    const tokenHash = await hashSessionToken(sessionToken, dependencies.sessionSecret)
    const session = await dependencies.sessionRepository.findByTokenHash(tokenHash, now())

    if (!session) {
      throw authError('unauthorized', 'Authentication is required', 401)
    }

    return {
      administrator: session.administrator,
      permissions: [...administratorPermissions]
    }
  }

  return {
    async getSetupStatus() {
      return {
        required: !(await dependencies.administratorRepository.hasAnyAdministrator())
      }
    },

    async setupAdministrator(input: { username: string; password: string }): Promise<AuthSessionResult> {
      requireSessionSecret(dependencies.sessionSecret)

      const createdAt = now()
      const administrator = await dependencies.administratorRepository.createFirst({
        id: crypto.randomUUID(),
        username: input.username,
        passwordHash: await hashPassword(input.password),
        createdAt,
        updatedAt: createdAt
      })

      if (!administrator) {
        throw authError('setup_already_completed', 'Administrator setup has already been completed', 409)
      }

      const sessionToken = await createSession(administrator.id)

      return { administrator, sessionToken }
    },

    async login(
      input: { username: string; password: string; secondFactor?: string },
      context: { ipAddress?: string | null } = {}
    ): Promise<AuthSessionResult> {
      requireSessionSecret(dependencies.sessionSecret)
      const ipAddress = context.ipAddress ?? 'unknown'
      const reservation = await reserveLoginAttempt({ username: input.username, ipAddress })
      if (dependencies.securityRepository) {
        const rules = await dependencies.securityRepository.listIpRules()
        if (!isAdminIpAllowed(context.ipAddress ?? null, rules)) {
          await completeFailedLoginAttempt({
            reservation,
            adminId: null,
            username: input.username,
            ipAddress,
            failureReason: 'ip_denied'
          })
          throw authError('ip_access_denied', 'This IP address is not allowed to access the administrator area', 403)
        }
      }

      const administrator = await dependencies.administratorRepository.findByUsername(input.username)

      if (!administrator || !(await verifyPassword(input.password, administrator.passwordHash))) {
        await completeFailedLoginAttempt({
          reservation,
          adminId: administrator?.id ?? null,
          username: input.username,
          ipAddress,
          failureReason: 'invalid_credentials'
        })
        throw authError('invalid_credentials', 'Invalid username or password', 401)
      }

      const twoFactor = await dependencies.securityRepository?.getTwoFactor(administrator.id)
      if (twoFactor?.enabledAt) {
        if (!input.secondFactor) {
          await completeFailedLoginAttempt({
            reservation,
            adminId: administrator.id,
            username: administrator.username,
            ipAddress,
            failureReason: 'two_factor_required'
          })
          throw authError('two_factor_required', 'Two-factor authentication code is required', 401)
        }
        if (!encryptionKey || !twoFactor.secretCiphertext || !twoFactor.secretIv) {
          await completeFailedLoginAttempt({
            reservation,
            adminId: administrator.id,
            username: administrator.username,
            ipAddress,
            failureReason: 'two_factor_unavailable'
          })
          throw authError('two_factor_unavailable', 'Two-factor authentication is unavailable', 503)
        }
        let secret: string
        try {
          secret = await decryptAdminSecret(twoFactor.secretCiphertext, twoFactor.secretIv, encryptionKey)
        } catch {
          await completeFailedLoginAttempt({
            reservation,
            adminId: administrator.id,
            username: administrator.username,
            ipAddress,
            failureReason: 'two_factor_unavailable'
          })
          throw authError('two_factor_unavailable', 'Two-factor authentication is unavailable', 503)
        }
        const validTotp = await verifyTotpCode(secret, input.secondFactor, now())
        if (!validTotp && dependencies.securityRepository) {
          const recoveryHash = await hashRecoveryCode(input.secondFactor, encryptionKey)
          const prepared = await prepareSession(administrator.id)
          let consumed = false
          try {
            consumed = await dependencies.securityRepository
              .consumeRecoveryCodeAndCreateSessionAndCompleteLoginAttempt({
                adminId: administrator.id,
                codeHash: recoveryHash,
                session: prepared.session,
                attemptId: reservation!.id,
                username: normalizeLoginUsername(administrator.username)
              })
          } catch (error) {
            console.error('[auth-service] failed to create recovery-code login session', error)
            throw authError(
              'login_audit_unavailable',
              'Login could not be completed because the security audit is unavailable',
              503
            )
          }
          if (consumed) {
            await cleanupLoginAttempts(reservation!.createdAt)
            return {
              administrator: { id: administrator.id, username: administrator.username },
              sessionToken: prepared.sessionToken
            }
          }
        }
        if (!validTotp) {
          await completeFailedLoginAttempt({
            reservation,
            adminId: administrator.id,
            username: administrator.username,
            ipAddress,
            failureReason: 'invalid_two_factor'
          })
          throw authError('invalid_two_factor', 'The authentication code is invalid', 401)
        }
      }

      const sessionToken = await createAuditedSession({
        adminId: administrator.id,
        username: administrator.username,
        ipAddress,
        reservation
      })

      return {
        administrator: {
          id: administrator.id,
          username: administrator.username
        },
        sessionToken
      }
    },

    getCurrentAdministrator,

    async requirePermission(sessionToken: string | undefined, permission: Permission): Promise<CurrentAdministratorResult> {
      const result = await getCurrentAdministrator(sessionToken)

      if (!result.permissions.includes(permission)) {
        throw authError('forbidden', 'Permission denied', 403)
      }

      return result
    },

    async logout(sessionToken: string | undefined): Promise<void> {
      requireSessionSecret(dependencies.sessionSecret)

      if (!sessionToken) {
        throw authError('unauthorized', 'Authentication is required', 401)
      }

      const tokenHash = await hashSessionToken(sessionToken, dependencies.sessionSecret)
      await dependencies.sessionRepository.deleteByTokenHash(tokenHash)
    }
  }
}

export type AuthService = ReturnType<typeof createAuthService>
