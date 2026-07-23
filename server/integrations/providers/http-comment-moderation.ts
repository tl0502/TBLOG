import { z } from 'zod'
import { CommentModerationProviderError } from '../../providers/comment-moderation/comment-moderation-provider'
import {
  createHttpCommentModerationProvider,
  listOpenAiCompatibleModels
} from '../../providers/comment-moderation/http-comment-moderation-provider'
import type { FormFieldMeta, IntegrationEnvironment, ProviderRegistration } from '../registry'

const modelIdSchema = z.string().trim().min(1).max(200)
/** Model may be omitted until Detect Models / manual entry; enable path still requires it via formMeta. */
const optionalModelIdSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  modelIdSchema.nullable().optional().default(null)
)

const configSchema = z
  .object({
    endpoint: z.string().trim().url().max(2048),
    model: optionalModelIdSchema,
    timeoutMs: z.coerce.number().int().min(1_000).max(15_000).optional().default(5_000),
    /** Server-managed catalog filled by the listModels action; not edited as a free-form form field. */
    availableModels: z.array(modelIdSchema).max(200).optional().default([])
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

/** Shared public HTTPS endpoint guard (also used by comment replica webhooks). */
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

function validateChatCompletionsEndpoint(value: unknown): string | null {
  const baseError = validateModerationEndpoint(value)
  if (baseError) return baseError
  try {
    const path = new URL(String(value)).pathname.replace(/\/+$/u, '')
    if (!path.endsWith('/chat/completions')) {
      return 'Endpoint must be an OpenAI-compatible .../chat/completions URL'
    }
    return null
  } catch {
    return 'Moderation endpoint must be a valid HTTPS URL'
  }
}

function availableModelsFrom(config: Record<string, unknown>): string[] {
  if (!Array.isArray(config.availableModels)) return []
  return config.availableModels.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

function resolveFormMeta(config: Record<string, unknown>): FormFieldMeta[] {
  const models = availableModelsFrom(config)
  const current = typeof config.model === 'string' ? config.model.trim() : ''
  const optionIds = [...new Set([...(current ? [current] : []), ...models])]
  const options = optionIds.map((id) => ({ value: id, label: id }))

  return [
    {
      key: 'endpoint',
      label: 'Chat completions URL',
      type: 'url',
      placeholder: 'https://api.example.com/v1/chat/completions',
      help: 'HTTPS OpenAI-compatible chat completions URL. Detect Models derives GET …/v1/models from this path.',
      required: true
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: options.length > 0 ? 'Select or type a model id' : 'gpt-4o-mini',
      help: options.length > 0
        ? 'Pick a detected model from the suggestions menu, or type any model id the gateway accepts.'
        : 'Optional until enable: enter a model id, or fill the endpoint and run Detect Models (uses the form draft).',
      // Required only when enabling; empty model is allowed so endpoint can be saved first.
      required: true,
      options: options.length > 0 ? options : undefined
    },
    {
      key: 'timeoutMs',
      label: 'Timeout (ms)',
      type: 'text',
      placeholder: '5000',
      help: 'Fail-closed request timeout between 1000 and 15000 milliseconds.',
      required: true
    }
  ]
}

function buildProvider(config: Record<string, unknown>, env: IntegrationEnvironment) {
  const apiKey = typeof env.COMMENT_MODERATION_API_KEY === 'string'
    ? env.COMMENT_MODERATION_API_KEY
    : ''
  const endpoint = typeof config.endpoint === 'string' ? config.endpoint : ''
  const model = typeof config.model === 'string' ? config.model.trim() : ''
  if (!apiKey || !model || validateChatCompletionsEndpoint(endpoint)) return null
  return createHttpCommentModerationProvider({
    endpoint,
    apiKey,
    model,
    timeoutMs: typeof config.timeoutMs === 'number' ? config.timeoutMs : 5_000,
    fetchImpl: typeof env.fetch === 'function' ? env.fetch as typeof fetch : undefined
  })
}

export const httpCommentModerationRegistration: ProviderRegistration = {
  capability: 'commentModeration',
  providerKey: 'http',
  displayName: 'OpenAI-Compatible LLM',
  configSchema,
  serverManagedConfigKeys: ['availableModels'],
  validate(config) {
    // Model is optional for save / Detect Models; enable still requires it via formMeta.required.
    return validateChatCompletionsEndpoint(config.endpoint)
  },
  resolveFormMeta(config) {
    return resolveFormMeta(config)
  },
  async checkStatus(config, env) {
    if (!env.COMMENT_MODERATION_API_KEY) {
      return { status: 'unavailable', error: 'Missing COMMENT_MODERATION_API_KEY secret' }
    }
    if (!config.endpoint) {
      return { status: 'misconfigured', error: 'Moderation endpoint is not set' }
    }
    if (typeof config.model !== 'string' || !config.model.trim()) {
      return { status: 'misconfigured', error: 'Model is required' }
    }
    const provider = buildProvider(config, env)
    if (!provider) return { status: 'misconfigured', error: 'Moderation configuration is invalid' }
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
  async executeAction(actionKey, config, env) {
    if (actionKey !== 'listModels') return null

    if (!env.COMMENT_MODERATION_API_KEY) {
      return {
        config,
        status: 'unavailable',
        error: 'Missing COMMENT_MODERATION_API_KEY secret'
      }
    }
    const endpointError = validateChatCompletionsEndpoint(config.endpoint)
    if (endpointError) {
      return { config, status: 'misconfigured', error: endpointError }
    }

    try {
      const models = await listOpenAiCompatibleModels({
        endpoint: String(config.endpoint),
        apiKey: String(env.COMMENT_MODERATION_API_KEY),
        timeoutMs: typeof config.timeoutMs === 'number' ? config.timeoutMs : 5_000,
        fetchImpl: typeof env.fetch === 'function' ? env.fetch as typeof fetch : undefined
      })
      return {
        config: { ...config, availableModels: models },
        // Mapped to disabled when the row is off; keeps a live row healthy after catalog refresh.
        status: 'active',
        error: null
      }
    } catch (error) {
      // Prefer the provider's public-safe detail (HTTP status / timeout / network) over a generic line.
      const detail = error instanceof CommentModerationProviderError
        ? error.message
        : 'Unable to list models from the OpenAI-compatible gateway'
      return {
        config,
        status: 'unavailable',
        error: detail.startsWith('Unable to list models')
          ? detail
          : `Unable to list models: ${detail}`
      }
    }
  },
  publicProjection(config) {
    return {
      endpoint: (config.endpoint as string | undefined) ?? null,
      model: typeof config.model === 'string' ? config.model : null,
      timeoutMs: (config.timeoutMs as number | undefined) ?? 5_000,
      availableModels: availableModelsFrom(config)
    }
  },
  createCommentModerationProvider(config, env) {
    return buildProvider(config, env)
  },
  requiredSecrets: ['COMMENT_MODERATION_API_KEY'],
  requiredBindings: [],
  formMeta: resolveFormMeta({}),
  actions: [
    { key: 'listModels', label: 'Detect models' },
    { key: 'test', label: 'Check status' }
  ]
}
