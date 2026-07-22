export const adminIpRuleTypeValues = ['allow', 'deny'] as const
export type AdminIpRuleType = (typeof adminIpRuleTypeValues)[number]

export const loginFailureReasonValues = [
  'invalid_credentials',
  'two_factor_required',
  'invalid_two_factor',
  'two_factor_unavailable',
  'ip_denied'
] as const
export type LoginFailureReason = (typeof loginFailureReasonValues)[number]

export interface AdministratorTwoFactorRecord {
  adminId: string
  secretCiphertext: string | null
  secretIv: string | null
  enabledAt: Date | null
}

export interface AdministratorIpRuleRecord {
  id: string
  type: AdminIpRuleType
  ipAddress: string
  createdAt: Date
}

export interface AdministratorLoginAttemptRecord {
  id: string
  adminId: string | null
  username: string
  ipAddress: string
  successful: boolean
  failureReason: LoginFailureReason | null
  createdAt: Date
}
