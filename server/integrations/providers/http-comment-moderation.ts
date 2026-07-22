import { z } from 'zod'
import { createHttpCommentModerationProvider } from '../../providers/comment-moderation/http-comment-moderation-provider'
import type { ProviderRegistration } from '../registry'

const configSchema = z
  .object({
    endpoint: z.string().trim().url().max(2048),
    model: z.string().trim().min(1).max(200).nullable().optional().default(null),
    timeoutMs: z.coerce.number().int().min(1_000).max(15_000).optional().default(5_000)
  })
  .strip()

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0
}

export function validateModerationEndpoint(value: unknown): string | null {
  try {
    const url = new URL(String(value))
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
    if (url.protocol !== 'https:') return 'Moderation endpoint must use HTTPS'
    if (url.username || url.password) return 'Moderation endpoint must not contain credentials'
    if (
      hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || hostname === '::'
      || hostname === '::1'
      || (hostname.includes(':') && (
        hostname.startsWith('fc')
        || hostname.startsWith('fd')
        || hostname.startsWith('fe80:')
        || hostname.startsWith('::ffff:')
      ))
      || isPrivateIpv4(hostname)
    ) {
      return 'Moderation endpoint must use a public host'
    }
    return null
  } catch {
    return 'Moderation endpoint must be a valid HTTPS URL'
  }
}

function buildProvider(config: Record<string, unknown>, env: Record<string, unknown>) {
  const apiKey = typeof env.COMMENT_MODERATION_API_KEY === 'string'
    ? env.COMMENT_MODERATION_API_KEY
    : ''
  const endpoint = typeof config.endpoint === 'string' ? config.endpoint : ''
  if (!apiKey || validateModerationEndpoint(endpoint)) return null
  return createHttpCommentModerationProvider({
    endpoint,
    apiKey,
    model: typeof config.model === 'string' ? config.model : null,
    timeoutMs: typeof config.timeoutMs === 'number' ? config.timeoutMs : 5_000,
    fetchImpl: typeof env.fetch === 'function' ? env.fetch as typeof fetch : undefined
  })
}

export const httpCommentModerationRegistration: ProviderRegistration = {
  capability: 'commentModeration',
  providerKey: 'http',
  displayName: 'HTTP Comment Moderation',
  configSchema,
  validate(config) {
    return validateModerationEndpoint(config.endpoint)
  },
  async checkStatus(config, env) {
    if (!env.COMMENT_MODERATION_API_KEY) {
      return { status: 'unavailable', error: 'Missing COMMENT_MODERATION_API_KEY secret' }
    }
    if (!config.endpoint) {
      return { status: 'misconfigured', error: 'Moderation endpoint is not set' }
    }
    const provider = buildProvider(config, env)
    if (!provider) return { status: 'misconfigured', error: 'Moderation endpoint is invalid' }
    try {
      const result = await provider.moderate({
        nickname: 'TBLOG Health Check',
        content: 'Non-public connectivity check for the configured moderation provider.',
        locale: 'en',
        post: { id: 'tblog-health-check', title: 'TBLOG Health Check' }
      })
      if (
        result.confidence === null
        || !Number.isFinite(result.confidence)
        || result.confidence < 0
        || result.confidence > 1
      ) {
        return {
          status: 'misconfigured',
          error: 'Moderation provider must return confidence for automatic decisions'
        }
      }
      return { status: 'active' }
    } catch {
      return { status: 'unavailable', error: 'Moderation endpoint probe failed' }
    }
  },
  publicProjection(config) {
    return {
      endpoint: (config.endpoint as string | undefined) ?? null,
      model: (config.model as string | null | undefined) ?? null,
      timeoutMs: (config.timeoutMs as number | undefined) ?? 5_000
    }
  },
  createCommentModerationProvider(config, env) {
    return buildProvider(config, env)
  },
  requiredSecrets: ['COMMENT_MODERATION_API_KEY'],
  requiredBindings: [],
  formMeta: [
    {
      key: 'endpoint',
      label: 'Endpoint',
      type: 'url',
      placeholder: 'https://moderation.example.com/v1/comments',
      help: 'HTTPS endpoint implementing the fixed TBLOG comment moderation protocol.',
      required: true
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'optional-model-name',
      help: 'Optional provider model identifier sent with moderation requests.',
      required: false
    },
    {
      key: 'timeoutMs',
      label: 'Timeout (ms)',
      type: 'text',
      placeholder: '5000',
      help: 'Fail-closed request timeout between 1000 and 15000 milliseconds.',
      required: true
    }
  ],
  actions: [{ key: 'test', label: 'Check status' }]
}
