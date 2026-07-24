import { loginInputSchema, setupAdminInputSchema } from '../../../server/validation/auth-input'

describe('auth input validation', () => {
  it('accepts, trims, and lowercases first administrator setup input', () => {
    expect(setupAdminInputSchema.parse({
      username: ' Admin ',
      password: 'correct horse battery staple'
    })).toEqual({
      username: 'admin',
      password: 'correct horse battery staple'
    })
  })

  it('rejects short setup passwords', () => {
    expect(() => setupAdminInputSchema.parse({
      username: 'admin',
      password: 'short'
    })).toThrow()
  })

  it('accepts non-empty login credentials and lowercases usernames', () => {
    expect(loginInputSchema.parse({
      username: ' Admin ',
      password: 'password'
    })).toEqual({
      username: 'admin',
      password: 'password'
    })
  })

  it('accepts an optional authenticator or recovery code', () => {
    expect(loginInputSchema.parse({
      username: 'admin', password: 'password', secondFactor: ' ABCDE-23456 '
    })).toMatchObject({ secondFactor: 'ABCDE-23456' })
  })
})
