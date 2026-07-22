const passwordAlgorithm = 'pbkdf2-sha256'
// Cloudflare Workers Web Crypto rejects PBKDF2 iteration counts above 100,000.
// The iteration count remains embedded in every stored hash so verification stays format-driven.
const passwordIterations = 100000
const passwordSaltBytes = 16
const passwordHashBytes = 32
const sessionTokenBytes = 32

const textEncoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
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

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false
  }

  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }

  return difference === 0
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations
    },
    key,
    passwordHashBytes * 8
  )

  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(passwordSaltBytes)
  const hash = await derivePasswordHash(password, salt, passwordIterations)

  return [
    passwordAlgorithm,
    passwordIterations.toString(),
    toBase64Url(salt),
    toBase64Url(hash)
  ].join('$')
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, iterationsValue, saltValue, hashValue] = storedHash.split('$')

  if (algorithm !== passwordAlgorithm || !iterationsValue || !saltValue || !hashValue) {
    return false
  }

  const iterations = Number(iterationsValue)
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false
  }

  try {
    const expectedHash = fromBase64Url(hashValue)
    const actualHash = await derivePasswordHash(password, fromBase64Url(saltValue), iterations)

    return constantTimeEqual(actualHash, expectedHash)
  } catch {
    return false
  }
}

export function createSessionToken(): string {
  return toBase64Url(randomBytes(sessionTokenBytes))
}

export async function hashSessionToken(token: string, sessionSecret: string): Promise<string> {
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET is required')
  }

  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(sessionSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(token))

  return toHex(new Uint8Array(signature))
}
