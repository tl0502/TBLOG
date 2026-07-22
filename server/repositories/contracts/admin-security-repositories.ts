import type {
  AdministratorIpRuleRecord,
  AdministratorLoginAttemptRecord,
  AdministratorTwoFactorRecord,
  AdminIpRuleType,
  LoginFailureReason
} from '../../domain/admin-security'
import type { NewAdministratorSessionRecord } from '../../domain/auth'

interface LoginAttemptWrite {
  id: string
  adminId: string | null
  username: string
  ipAddress: string
  successful: boolean
  failureReason: LoginFailureReason | null
  createdAt: Date
}

export interface AdminSecurityRepository {
  getTwoFactor(adminId: string): Promise<AdministratorTwoFactorRecord | null>
  savePendingTwoFactor(input: {
    adminId: string
    secretCiphertext: string
    secretIv: string
    now: Date
  }): Promise<void>
  enableTwoFactor(input: {
    adminId: string
    enabledAt: Date
    recoveryCodes: Array<{ id: string; codeHash: string }>
  }): Promise<void>
  disableTwoFactor(adminId: string, now: Date): Promise<void>
  consumeRecoveryCodeAndDisableTwoFactor(input: {
    adminId: string
    codeHash: string
    now: Date
  }): Promise<boolean>
  updateCredentialsAndDeleteOtherSessions(input: {
    adminId: string
    username?: string
    passwordHash: string
    currentTokenHash: string
    updatedAt: Date
  }): Promise<void>
  listIpRules(): Promise<AdministratorIpRuleRecord[]>
  replaceIpRules(input: {
    adminId: string
    rules: Array<{ id: string; type: AdminIpRuleType; ipAddress: string }>
    now: Date
  }): Promise<void>
  recordLoginAttempt(input: LoginAttemptWrite): Promise<void>
  reserveLoginAttempt(input: {
    attempt: LoginAttemptWrite & { adminId: null; successful: false; failureReason: null }
    cutoff: Date
    maximumFailures: number
  }): Promise<boolean>
  completeLoginAttempt(input: {
    id: string
    adminId: string | null
    username: string
    failureReason: LoginFailureReason
  }): Promise<boolean>
  getRecentLoginFailures(input: {
    ipAddress: string
    username: string
    cutoff: Date
    limit: number
  }): Promise<{ ipAddress: Date[]; username: Date[] }>
  createSessionAndCompleteLoginAttempt(input: {
    session: NewAdministratorSessionRecord & { createdAt: Date }
    attemptId: string
    adminId: string
    username: string
  }): Promise<boolean>
  consumeRecoveryCodeAndCreateSessionAndCompleteLoginAttempt(input: {
    adminId: string
    codeHash: string
    session: NewAdministratorSessionRecord & { createdAt: Date }
    attemptId: string
    username: string
  }): Promise<boolean>
  listLoginAttempts(input: { offset: number; limit: number; cutoff: Date }): Promise<{
    items: AdministratorLoginAttemptRecord[]
    total: number
  }>
  deleteLoginAttemptsBefore(cutoff: Date, limit: number): Promise<void>
}
