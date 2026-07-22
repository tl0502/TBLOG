import { z } from 'zod'
import { createHttpCommentReplicaProvider } from '../../providers/comment-replica/http-comment-replica-provider'
import type { ProviderRegistration } from '../registry'
import { validateModerationEndpoint } from './http-comment-moderation'

const configSchema = z.object({
  endpoint: z.string().trim().url().max(2048),
  timeoutMs: z.coerce.number().int().min(1_000).max(15_000).optional().default(5_000)
}).strip()

function build(config: Record<string, unknown>, env: Record<string, unknown>) {
  const secret = typeof env.COMMENT_REPLICA_WEBHOOK_SECRET === 'string'
    ? env.COMMENT_REPLICA_WEBHOOK_SECRET
    : ''
  const endpoint = typeof config.endpoint === 'string' ? config.endpoint : ''
  if (!secret || validateModerationEndpoint(endpoint)) return null
  return createHttpCommentReplicaProvider({
    endpoint,
    secret,
    timeoutMs: typeof config.timeoutMs === 'number' ? config.timeoutMs : 5_000,
    fetchImpl: typeof env.fetch === 'function' ? env.fetch as typeof fetch : undefined
  })
}

export const httpCommentReplicaRegistration: ProviderRegistration = {
  capability: 'commentReplica',
  providerKey: 'http',
  displayName: 'HTTP Comment Replica',
  configSchema,
  validate(config) { return validateModerationEndpoint(config.endpoint) },
  checkStatus(config, env) {
    if (!env.COMMENT_REPLICA_WEBHOOK_SECRET) return { status: 'unavailable', error: 'Missing COMMENT_REPLICA_WEBHOOK_SECRET secret' }
    return build(config, env)
      ? { status: 'configured' }
      : { status: 'misconfigured', error: 'Replica endpoint is invalid' }
  },
  publicProjection(config) { return { endpoint: config.endpoint ?? null, timeoutMs: config.timeoutMs ?? 5_000 } },
  createCommentReplicaProvider(config, env) { return build(config, env) },
  requiredSecrets: ['COMMENT_REPLICA_WEBHOOK_SECRET'],
  requiredBindings: [],
  formMeta: [
    { key: 'endpoint', label: 'Endpoint', type: 'url', placeholder: 'https://backup.example.com/tblog/comments', help: 'Receives public-safe comment lifecycle projections after D1 succeeds.', required: true },
    { key: 'timeoutMs', label: 'Timeout (ms)', type: 'text', placeholder: '5000', help: 'Webhook timeout between 1000 and 15000 milliseconds.', required: true }
  ],
  actions: [
    { key: 'test', label: 'Check configuration' },
    { key: 'retry', label: 'Retry failed replicas' }
  ]
}
