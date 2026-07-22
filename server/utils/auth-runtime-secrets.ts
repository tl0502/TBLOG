export interface AuthRuntimeSecrets {
  sessionSecret: string
  authEncryptionKey: string
}

export type SessionSecretIssue = 'missing' | 'too_short' | 'placeholder' | null

const sessionSecretMinimumBytes = 32
const placeholderFragments = [
  'replace-with',
  'change-me',
  'changeme',
  'placeholder',
  'test-secret',
  'session-secret',
  'local-development-secret'
]

/**
 * Runtime validation cannot prove entropy, but it can reject the deployment mistakes that most
 * commonly turn an HMAC key into a guessable value. Production documentation supplies a random-key
 * generator; this guard enforces its minimum byte strength and rejects committed example values.
 */
export function getSessionSecretIssue(value: string): SessionSecretIssue {
  if (!value) return 'missing'
  if (new TextEncoder().encode(value).byteLength < sessionSecretMinimumBytes) return 'too_short'

  const normalized = value.trim().toLowerCase()
  if (placeholderFragments.some((fragment) => normalized.includes(fragment))) return 'placeholder'
  if (new Set(normalized).size < 4) return 'placeholder'
  return null
}

export function mergeRuntimeEnv(
  baseEnv: Record<string, unknown>,
  cloudflareEnv?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...baseEnv,
    ...(cloudflareEnv ?? {})
  }
}

function readSecret(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function resolveAuthRuntimeSecrets(
  baseEnv: Record<string, unknown> = process.env,
  cloudflareEnv?: Record<string, unknown>
): AuthRuntimeSecrets {
  const env = mergeRuntimeEnv(baseEnv, cloudflareEnv)

  return {
    sessionSecret: readSecret(env.SESSION_SECRET)
      ?? '',
    authEncryptionKey: readSecret(env.AUTH_ENCRYPTION_KEY)
      ?? ''
  }
}
