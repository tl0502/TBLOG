import {
  createTotpCode,
  decryptAdminSecret,
  encryptAdminSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  parseAuthEncryptionKey,
  verifyTotpCode
} from '../../../server/utils/admin-security-crypto'

function encodedKey(fill: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(32).fill(fill)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

describe('administrator security crypto', () => {
  it('requires an exact 32-byte base64url encryption key', () => {
    expect(parseAuthEncryptionKey(encodedKey(7))).toHaveLength(32)
    expect(parseAuthEncryptionKey('')).toBeNull()
    expect(parseAuthEncryptionKey('not-a-key')).toBeNull()
  })

  it('encrypts and decrypts the TOTP seed with AES-GCM', async () => {
    const key = parseAuthEncryptionKey(encodedKey(3))!
    const encrypted = await encryptAdminSecret('JBSWY3DPEHPK3PXP', key)

    expect(encrypted.ciphertext).not.toContain('JBSWY3DPEHPK3PXP')
    await expect(decryptAdminSecret(encrypted.ciphertext, encrypted.iv, key))
      .resolves.toBe('JBSWY3DPEHPK3PXP')
    await expect(decryptAdminSecret(encrypted.ciphertext, encrypted.iv, parseAuthEncryptionKey(encodedKey(4))!))
      .rejects.toBeDefined()
  })

  it('matches the RFC 6238 SHA-1 vector truncated to six digits', async () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    const at59Seconds = new Date(59_000)

    await expect(createTotpCode(secret, at59Seconds)).resolves.toBe('287082')
    await expect(verifyTotpCode(secret, '287082', at59Seconds)).resolves.toBe(true)
    await expect(verifyTotpCode(secret, '000000', at59Seconds)).resolves.toBe(false)
  })

  it('normalizes and hashes recovery codes without storing their plaintext form', async () => {
    const key = parseAuthEncryptionKey(encodedKey(9))!
    expect(normalizeRecoveryCode('abcde-f2345')).toBe('ABCDEF2345')
    await expect(hashRecoveryCode('ABCDE-F2345', key))
      .resolves.toBe(await hashRecoveryCode('abcdef2345', key))
  })
})
