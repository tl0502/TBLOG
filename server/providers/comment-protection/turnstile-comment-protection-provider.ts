import {
  CommentProtectionProviderError,
  type CommentProtectionProvider,
  type CommentProtectionVerification
} from './comment-protection-provider'

export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

interface TurnstileVerificationResponse {
  success?: boolean
  action?: string
  hostname?: string
  'error-codes'?: string[]
}

export interface TurnstileCommentProtectionOptions {
  secretKey: string
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

export interface TurnstileSecretProbeOptions {
  secretKey: string
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

function normalizeHostname(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/\.$/u, '') ?? ''
}

async function fetchTurnstileVerification(
  fetcher: typeof globalThis.fetch,
  body: Record<string, string>,
  timeoutMs: number
): Promise<TurnstileVerificationResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!response.ok) {
      throw new CommentProtectionProviderError('unavailable', 'Turnstile verification failed')
    }
    return await response.json() as TurnstileVerificationResponse
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Confirms that Cloudflare accepts the configured secret without requiring a visitor challenge.
 * A deliberate invalid token proves secret validity when Siteverify returns invalid-input-response.
 * Widget pairing and hostname authorization still require a real browser token at submission time.
 */
export async function probeTurnstileSecret(options: TurnstileSecretProbeOptions): Promise<boolean> {
  const fetcher = options.fetch ?? globalThis.fetch
  try {
    const result = await fetchTurnstileVerification(fetcher, {
      secret: options.secretKey,
      response: 'TBLOG.TURNSTILE.SECRET.PROBE'
    }, options.timeoutMs ?? 5_000)
    if (result.success) return true
    const errorCodes = result['error-codes'] ?? []
    if (errorCodes.some((code) => ['missing-input-secret', 'invalid-input-secret'].includes(code))) {
      return false
    }
    if (errorCodes.includes('invalid-input-response')) return true
    throw new CommentProtectionProviderError('unavailable', 'Turnstile secret probe failed')
  } catch (error) {
    if (error instanceof CommentProtectionProviderError) throw error
    throw new CommentProtectionProviderError('unavailable', 'Turnstile secret probe is unavailable')
  }
}

/**
 * Cloudflare Turnstile adapter. Tokens are single-use and are always verified server-side. The
 * client widget uses the `comment` action, which is checked here so a token minted for another
 * surface cannot be replayed for comment submission.
 */
export function createTurnstileCommentProtectionProvider(
  options: TurnstileCommentProtectionOptions
): CommentProtectionProvider {
  const fetcher = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 8_000

  return {
    async verify(input: CommentProtectionVerification): Promise<void> {
      const token = input.token?.trim()
      if (!token || token.length > 2048) {
        throw new CommentProtectionProviderError('rejected', 'Turnstile token is missing or invalid')
      }

      try {
        const result = await fetchTurnstileVerification(fetcher, {
          secret: options.secretKey,
          response: token,
          ...(input.remoteIp ? { remoteip: input.remoteIp } : {}),
          idempotency_key: crypto.randomUUID()
        }, timeoutMs)
        const expectedHostname = normalizeHostname(input.expectedHostname)
        const hostnameAccepted = Boolean(expectedHostname)
          && normalizeHostname(result.hostname) === expectedHostname
        if (!result.success || result.action !== 'comment' || !hostnameAccepted) {
          const providerUnavailable = result['error-codes']?.some((code) =>
            ['internal-error', 'missing-input-secret', 'invalid-input-secret'].includes(code)
          )
          throw new CommentProtectionProviderError(
            providerUnavailable ? 'unavailable' : 'rejected',
            'Turnstile verification was not accepted'
          )
        }
      } catch (error) {
        if (error instanceof CommentProtectionProviderError) {
          throw error
        }
        throw new CommentProtectionProviderError('unavailable', 'Turnstile verification is unavailable')
      }
    }
  }
}
