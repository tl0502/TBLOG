import {
  disableTwoFactorSchema,
  enableTwoFactorSchema,
  loginAttemptQuerySchema,
  replaceAdminIpRulesSchema,
  updateAdministratorAccountSchema
} from '../../../server/validation/admin-security-input'

describe('admin security input validation', () => {
  it('requires a current password and at least one account change', () => {
    expect(updateAdministratorAccountSchema.parse({
      currentPassword: 'current', username: 'owner'
    })).toMatchObject({ username: 'owner' })
    expect(() => updateAdministratorAccountSchema.parse({ currentPassword: 'current' })).toThrow()
    expect(() => updateAdministratorAccountSchema.parse({
      currentPassword: 'current', password: 'short'
    })).toThrow()
  })

  it('validates two-factor inputs and bounded IP lists', () => {
    expect(enableTwoFactorSchema.parse({ code: '123456' })).toEqual({ code: '123456' })
    expect(() => enableTwoFactorSchema.parse({ code: '12345' })).toThrow()
    expect(disableTwoFactorSchema.parse({
      currentPassword: 'current', secondFactor: 'ABCDE-23456'
    })).toBeDefined()
    expect(replaceAdminIpRulesSchema.parse({
      allow: ['192.0.2.1'], deny: []
    })).toBeDefined()
  })

  it('coerces bounded login history pagination', () => {
    expect(loginAttemptQuerySchema.parse({ offset: '25', limit: '50' }))
      .toEqual({ offset: 25, limit: 50 })
    expect(() => loginAttemptQuerySchema.parse({ limit: 101 })).toThrow()
  })
})
