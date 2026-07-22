import { z } from 'zod'
import { probeTurnstileSecret } from '../../providers/comment-protection/turnstile-comment-protection-provider'
import type { ProviderRegistration } from '../registry'

const configSchema = z
  .object({
    siteKey: z.string().trim().min(1).optional()
  })
  .strip()

/**
 * Turnstile comment protection. The site key is public and stored in D1; the paired verification
 * secret (`TURNSTILE_SECRET_KEY`) must live in Cloudflare Secrets and is never persisted. Aligns with
 * the runtime comment-protection provider used at comment-submission time.
 */
export const turnstileRegistration: ProviderRegistration = {
  capability: 'commentProtection',
  providerKey: 'turnstile',
  displayName: 'Cloudflare Turnstile',
  configSchema,
  validate() {
    return null
  },
  async checkStatus(config, env) {
    const secretKey = typeof env.TURNSTILE_SECRET_KEY === 'string'
      ? env.TURNSTILE_SECRET_KEY.trim()
      : ''
    if (!secretKey) {
      return { status: 'unavailable', error: 'Missing TURNSTILE_SECRET_KEY secret' }
    }
    if (!config.siteKey) {
      return { status: 'misconfigured', error: 'Turnstile site key is not set' }
    }
    try {
      const accepted = await probeTurnstileSecret({
        secretKey,
        fetch: typeof env.fetch === 'function' ? env.fetch as typeof fetch : undefined
      })
      return accepted
        ? { status: 'configured' }
        : { status: 'unavailable', error: 'TURNSTILE_SECRET_KEY is invalid' }
    } catch {
      return { status: 'unavailable', error: 'Turnstile secret probe failed' }
    }
  },
  publicProjection(config) {
    return { siteKey: (config.siteKey as string | undefined) ?? null }
  },
  requiredSecrets: ['TURNSTILE_SECRET_KEY'],
  requiredBindings: [],
  formMeta: [
    {
      key: 'siteKey',
      label: 'Site key',
      type: 'text',
      placeholder: '0x4AAAAAAA...',
      help: 'Public Turnstile site key rendered in the comment widget.',
      required: true
    }
  ],
  actions: [{ key: 'test', label: 'Check status' }]
}
