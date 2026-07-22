import { authError } from '../domain/auth-errors'
import type { AdminIpRuleType } from '../domain/admin-security'
import type {
  AdministratorRepository
} from '../repositories/contracts/auth-repositories'
import type { AdminSecurityRepository } from '../repositories/contracts/admin-security-repositories'
import {
  createTotpUri,
  decryptAdminSecret,
  encryptAdminSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  parseAuthEncryptionKey,
  verifyTotpCode
} from '../utils/admin-security-crypto'
import { isAdminIpAllowed, normalizeIpAddress } from '../utils/admin-request-ip'
import { hashPassword, hashSessionToken, verifyPassword } from '../utils/auth-crypto'
import { getSessionSecretIssue } from '../utils/auth-runtime-secrets'
import type { CurrentAdministratorResult } from './auth-service'

export interface AdminSecurityServiceDependencies {
  administratorRepository: AdministratorRepository
  securityRepository: AdminSecurityRepository
  sessionSecret: string
  authEncryptionKey: string
  now?: () => Date
}

function requireUserPermission(current: CurrentAdministratorResult): void {
  if (!current.permissions.includes('user:*')) {
    throw authError('forbidden', 'Permission denied', 403)
  }
}

export function createAdminSecurityService(dependencies: AdminSecurityServiceDependencies) {
  const now = dependencies.now ?? (() => new Date())
  const encryptionKey = parseAuthEncryptionKey(dependencies.authEncryptionKey)

  async function requireCurrentPassword(adminId: string, password: string) {
    const administrator = await dependencies.administratorRepository.findByIdWithPassword(adminId)
    if (!administrator || !(await verifyPassword(password, administrator.passwordHash))) {
      throw authError('incorrect_current_password', 'Current password is incorrect', 401)
    }
    return administrator
  }

  function requireEncryptionKey(): Uint8Array {
    if (!encryptionKey) {
      throw authError(
        'two_factor_unavailable',
        'Two-factor authentication is unavailable because AUTH_ENCRYPTION_KEY is not configured',
        503
      )
    }
    return encryptionKey
  }

  async function loadTwoFactorSecret(adminId: string): Promise<{
    secret: string
    enabled: boolean
  }> {
    const record = await dependencies.securityRepository.getTwoFactor(adminId)
    if (!record?.secretCiphertext || !record.secretIv) {
      throw authError('two_factor_not_pending', 'Two-factor setup has not been started', 409)
    }
    try {
      return {
        secret: await decryptAdminSecret(record.secretCiphertext, record.secretIv, requireEncryptionKey()),
        enabled: record.enabledAt !== null
      }
    } catch (error) {
      if ((error as { code?: string }).code === 'two_factor_unavailable') throw error
      throw authError('two_factor_unavailable', 'Two-factor authentication could not be decrypted', 503)
    }
  }

  return {
    async assertIpAllowed(ipAddress: string | null): Promise<void> {
      const rules = await dependencies.securityRepository.listIpRules()
      if (!isAdminIpAllowed(ipAddress, rules)) {
        throw authError('ip_access_denied', 'This IP address is not allowed to access the administrator area', 403)
      }
    },

    async getOverview(current: CurrentAdministratorResult, requestIp: string | null) {
      requireUserPermission(current)
      const [twoFactor, rules] = await Promise.all([
        dependencies.securityRepository.getTwoFactor(current.administrator.id),
        dependencies.securityRepository.listIpRules()
      ])
      return {
        account: current.administrator,
        twoFactor: {
          available: encryptionKey !== null,
          enabled: twoFactor?.enabledAt !== null && twoFactor?.enabledAt !== undefined
        },
        ipAccess: {
          currentIp: requestIp,
          allow: rules.filter((rule) => rule.type === 'allow').map((rule) => rule.ipAddress),
          deny: rules.filter((rule) => rule.type === 'deny').map((rule) => rule.ipAddress)
        }
      }
    },

    async updateAccount(
      current: CurrentAdministratorResult,
      sessionToken: string,
      input: { currentPassword: string; username?: string; password?: string }
    ) {
      requireUserPermission(current)
      const administrator = await requireCurrentPassword(current.administrator.id, input.currentPassword)
      if (input.password) {
        const secretIssue = getSessionSecretIssue(dependencies.sessionSecret)
        if (secretIssue === 'missing') {
          throw authError('missing_session_secret', 'SESSION_SECRET is not configured', 500)
        }
        if (secretIssue !== null) {
          throw authError(
            'invalid_session_secret',
            'SESSION_SECRET must be a random value of at least 32 bytes',
            500
          )
        }
      }
      if (input.username && input.username !== administrator.username) {
        const existing = await dependencies.administratorRepository.findByUsername(input.username)
        if (existing && existing.id !== administrator.id) {
          throw authError('username_conflict', 'Username is already in use', 409)
        }
      }
      if (input.password) {
        const currentTokenHash = await hashSessionToken(sessionToken, dependencies.sessionSecret)
        await dependencies.securityRepository.updateCredentialsAndDeleteOtherSessions({
          adminId: administrator.id,
          username: input.username,
          passwordHash: await hashPassword(input.password),
          currentTokenHash,
          updatedAt: now()
        })
        return { id: administrator.id, username: input.username ?? administrator.username }
      }
      return dependencies.administratorRepository.updateCredentials({
        id: administrator.id,
        username: input.username,
        updatedAt: now()
      })
    },

    async startTwoFactor(current: CurrentAdministratorResult, currentPassword: string) {
      requireUserPermission(current)
      await requireCurrentPassword(current.administrator.id, currentPassword)
      const existing = await dependencies.securityRepository.getTwoFactor(current.administrator.id)
      if (existing?.enabledAt) {
        throw authError('two_factor_not_pending', 'Two-factor authentication is already enabled', 409)
      }
      const secret = generateTotpSecret()
      const encrypted = await encryptAdminSecret(secret, requireEncryptionKey())
      await dependencies.securityRepository.savePendingTwoFactor({
        adminId: current.administrator.id,
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        now: now()
      })
      return {
        secret,
        otpauthUri: createTotpUri(current.administrator.username, secret)
      }
    },

    async enableTwoFactor(current: CurrentAdministratorResult, code: string) {
      requireUserPermission(current)
      const pending = await loadTwoFactorSecret(current.administrator.id)
      if (pending.enabled) {
        throw authError('two_factor_not_pending', 'Two-factor authentication is already enabled', 409)
      }
      if (!(await verifyTotpCode(pending.secret, code, now()))) {
        throw authError('invalid_two_factor', 'The authentication code is invalid', 401)
      }
      const recoveryCodes = generateRecoveryCodes()
      const recoveryRecords = await Promise.all(recoveryCodes.map(async (value) => ({
        id: crypto.randomUUID(),
        codeHash: await hashRecoveryCode(value, requireEncryptionKey())
      })))
      await dependencies.securityRepository.enableTwoFactor({
        adminId: current.administrator.id,
        enabledAt: now(),
        recoveryCodes: recoveryRecords
      })
      return { recoveryCodes }
    },

    async disableTwoFactor(
      current: CurrentAdministratorResult,
      input: { currentPassword: string; secondFactor: string }
    ) {
      requireUserPermission(current)
      await requireCurrentPassword(current.administrator.id, input.currentPassword)
      const state = await dependencies.securityRepository.getTwoFactor(current.administrator.id)
      if (!state?.enabledAt) {
        throw authError('two_factor_not_enabled', 'Two-factor authentication is not enabled', 409)
      }
      const twoFactor = await loadTwoFactorSecret(current.administrator.id)
      if (await verifyTotpCode(twoFactor.secret, input.secondFactor, now())) {
        await dependencies.securityRepository.disableTwoFactor(current.administrator.id, now())
        return
      }
      const codeHash = await hashRecoveryCode(input.secondFactor, requireEncryptionKey())
      const disabled = await dependencies.securityRepository.consumeRecoveryCodeAndDisableTwoFactor({
        adminId: current.administrator.id,
        codeHash,
        now: now()
      })
      if (!disabled) throw authError('invalid_two_factor', 'The authentication code is invalid', 401)
    },

    async replaceIpRules(
      current: CurrentAdministratorResult,
      requestIp: string | null,
      input: { allow: string[]; deny: string[] }
    ) {
      requireUserPermission(current)
      const normalized: Array<{ type: AdminIpRuleType; ipAddress: string }> = []
      for (const [type, values] of [['allow', input.allow], ['deny', input.deny]] as const) {
        for (const value of values) {
          const ipAddress = normalizeIpAddress(value)
          if (!ipAddress) throw authError('validation_failed', `Invalid IP address: ${value}`, 422)
          if (!normalized.some((rule) => rule.type === type && rule.ipAddress === ipAddress)) {
            normalized.push({ type, ipAddress })
          }
        }
      }
      if (!isAdminIpAllowed(requestIp, normalized.map((rule, index) => ({
        id: String(index),
        createdAt: now(),
        ...rule
      })))) {
        throw authError('ip_self_lockout', 'The IP policy would block your current address', 422)
      }
      await dependencies.securityRepository.replaceIpRules({
        adminId: current.administrator.id,
        rules: normalized.map((rule) => ({ id: crypto.randomUUID(), ...rule })),
        now: now()
      })
      return {
        allow: normalized.filter((rule) => rule.type === 'allow').map((rule) => rule.ipAddress),
        deny: normalized.filter((rule) => rule.type === 'deny').map((rule) => rule.ipAddress)
      }
    },

    async listLoginAttempts(current: CurrentAdministratorResult, input: { offset: number; limit: number }) {
      requireUserPermission(current)
      return dependencies.securityRepository.listLoginAttempts({
        ...input,
        cutoff: new Date(now().getTime() - 90 * 24 * 60 * 60 * 1000)
      })
    }
  }
}

export type AdminSecurityService = ReturnType<typeof createAdminSecurityService>
