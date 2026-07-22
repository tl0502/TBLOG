const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const recoveryAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return buffer instanceof ArrayBuffer ? buffer : new Uint8Array(bytes).buffer
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

export function parseAuthEncryptionKey(value: string): Uint8Array | null {
  if (!value) return null
  try {
    const key = fromBase64Url(value.trim())
    return key.length === 32 ? key : null
  } catch {
    return null
  }
}

export async function encryptAdminSecret(
  plaintext: string,
  keyBytes: Uint8Array
): Promise<{ ciphertext: string; iv: string }> {
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), 'AES-GCM', false, ['encrypt'])
  const iv = randomBytes(12)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    textEncoder.encode(plaintext)
  )
  return { ciphertext: toBase64Url(new Uint8Array(encrypted)), iv: toBase64Url(iv) }
}

export async function decryptAdminSecret(
  ciphertext: string,
  iv: string,
  keyBytes: Uint8Array
): Promise<string> {
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), 'AES-GCM', false, ['decrypt'])
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(fromBase64Url(iv)) },
    key,
    toArrayBuffer(fromBase64Url(ciphertext))
  )
  return textDecoder.decode(decrypted)
}

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31]
  return output
}

function decodeBase32(value: string): Uint8Array {
  let bits = 0
  let buffer = 0
  const output: number[] = []
  for (const character of value.toUpperCase().replaceAll('=', '').replaceAll(' ', '')) {
    const index = base32Alphabet.indexOf(character)
    if (index < 0) throw new Error('Invalid base32 value')
    buffer = (buffer << 5) | index
    bits += 5
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Uint8Array.from(output)
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20))
}

async function totpAt(secret: string, counter: number): Promise<string> {
  const counterBytes = new Uint8Array(8)
  let remaining = counter
  for (let index = 7; index >= 0; index -= 1) {
    counterBytes[index] = remaining & 255
    remaining = Math.floor(remaining / 256)
  }
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(decodeBase32(secret)),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, toArrayBuffer(counterBytes)))
  const offset = signature[signature.length - 1] & 15
  const binary = (
    ((signature[offset] & 127) << 24)
    | (signature[offset + 1] << 16)
    | (signature[offset + 2] << 8)
    | signature[offset + 3]
  ) >>> 0
  return String(binary % 1_000_000).padStart(6, '0')
}

export function createTotpCode(secret: string, now = new Date()): Promise<string> {
  return totpAt(secret, Math.floor(now.getTime() / 30_000))
}

export async function verifyTotpCode(secret: string, code: string, now = new Date()): Promise<boolean> {
  const normalized = code.trim()
  if (!/^\d{6}$/.test(normalized)) return false
  const counter = Math.floor(now.getTime() / 30_000)
  for (const offset of [-1, 0, 1]) {
    if (constantTimeEqual(await totpAt(secret, counter + offset), normalized)) return true
  }
  return false
}

export function createTotpUri(username: string, secret: string): string {
  const issuer = 'TBLOG'
  const label = `${issuer}:${username}`
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30'
  })
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10)
    const value = Array.from(bytes, (byte) => recoveryAlphabet[byte % recoveryAlphabet.length]).join('')
    return `${value.slice(0, 5)}-${value.slice(5)}`
  })
}

export function normalizeRecoveryCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export async function hashRecoveryCode(value: string, keyBytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(normalizeRecoveryCode(value)))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
