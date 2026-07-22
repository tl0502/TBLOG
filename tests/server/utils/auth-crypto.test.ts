import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword
} from '../../../server/utils/auth-crypto'

describe('auth crypto', () => {
  it('verifies a password against its stored hash', async () => {
    const storedHash = await hashPassword('correct horse battery staple')

    await expect(verifyPassword('correct horse battery staple', storedHash)).resolves.toBe(true)
    await expect(verifyPassword('wrong password', storedHash)).resolves.toBe(false)
  })

  it('creates different stored hashes for the same password', async () => {
    const first = await hashPassword('same password')
    const second = await hashPassword('same password')

    expect(first).not.toBe(second)
    expect(first.startsWith('pbkdf2-sha256$')).toBe(true)
  })

  it('keeps new PBKDF2 hashes within the Cloudflare Workers iteration limit', async () => {
    const storedHash = await hashPassword('cloudflare-compatible password')

    expect(storedHash.split('$')[1]).toBe('100000')
  })

  it('creates random session tokens', () => {
    expect(createSessionToken()).not.toBe(createSessionToken())
    expect(createSessionToken()).toHaveLength(43)
  })

  it('hashes session tokens with the configured secret', async () => {
    const first = await hashSessionToken('token', 'secret-a')
    const second = await hashSessionToken('token', 'secret-b')

    expect(first).not.toBe(second)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
  })
})
