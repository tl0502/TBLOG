import { z } from 'zod'
import {
  createOpenAiCommentModerationProvider,
  DEFAULT_OPENAI_MODERATION_MODEL
} from '../../providers/comment-moderation/openai-comment-moderation-provider'
import type { ProviderRegistration } from '../registry'

export const OPENAI_API_KEY_SECRET = 'OPENAI_API_KEY'

export const openAiCommentModerationConfigSchema = z.object({
  model: z.literal(DEFAULT_OPENAI_MODERATION_MODEL).optional().default(DEFAULT_OPENAI_MODERATION_MODEL),
  timeoutMs: z.coerce.number().int().min(1_000).max(15_000).optional().default(5_000)
}).strip()

function buildProvider(config: Record<string, unknown>, env: Record<string, unknown>) {
  const apiKey = typeof env[OPENAI_API_KEY_SECRET] === 'string'
    ? (env[OPENAI_API_KEY_SECRET] as string).trim()
    : ''
  if (!apiKey) return null

  return createOpenAiCommentModerationProvider({
    apiKey,
    model: config.model === DEFAULT_OPENAI_MODERATION_MODEL
      ? config.model
      : DEFAULT_OPENAI_MODERATION_MODEL,
    timeoutMs: typeof config.timeoutMs === 'number' ? config.timeoutMs : 5_000,
    fetchImpl: typeof env.fetch === 'function' ? env.fetch as typeof fetch : undefined
  })
}

export const openAiCommentModerationRegistration: ProviderRegistration = {
  capability: 'commentModeration',
  providerKey: 'openai',
  displayName: 'OpenAI Moderation',
  configSchema: openAiCommentModerationConfigSchema,
  validate() {
    return null
  },
  async checkStatus(config, env) {
    if (typeof env[OPENAI_API_KEY_SECRET] !== 'string'
      || !(env[OPENAI_API_KEY_SECRET] as string).trim()) {
      return { status: 'unavailable', error: `Missing ${OPENAI_API_KEY_SECRET} secret` }
    }
    const provider = buildProvider(config, env)
    if (!provider) return { status: 'misconfigured', error: 'OpenAI Moderation configuration is invalid' }
    try {
      await provider.moderate({
        nickname: 'TBLOG Health Check',
        content: 'Non-public connectivity check for the configured moderation provider.',
        locale: 'en',
        post: { id: 'tblog-health-check', title: 'TBLOG Health Check' }
      })
      return { status: 'active' }
    } catch {
      return { status: 'unavailable', error: 'OpenAI Moderation API probe failed' }
    }
  },
  publicProjection(config) {
    return {
      model: config.model === DEFAULT_OPENAI_MODERATION_MODEL
        ? config.model
        : DEFAULT_OPENAI_MODERATION_MODEL,
      timeoutMs: typeof config.timeoutMs === 'number' ? config.timeoutMs : 5_000
    }
  },
  requiredSecrets: [OPENAI_API_KEY_SECRET],
  requiredBindings: [],
  formMeta: [
    {
      key: 'model',
      label: 'Model',
      type: 'select',
      help: 'OpenAI safety model. Unflagged comments remain pending; only high-confidence violations are auto-rejected.',
      required: false,
      options: [{ value: DEFAULT_OPENAI_MODERATION_MODEL, label: DEFAULT_OPENAI_MODERATION_MODEL }]
    },
    {
      key: 'timeoutMs',
      label: 'Timeout (ms)',
      type: 'text',
      placeholder: '5000',
      help: 'Moderation API timeout between 1000 and 15000 milliseconds.',
      required: false
    }
  ],
  actions: [{ key: 'test', label: 'Check status' }],
  createCommentModerationProvider(config, env) {
    return buildProvider(config, env)
  }
}
