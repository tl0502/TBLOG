import type { H3Event } from 'h3'
import { getDatabaseClient } from '../../database/client'
import { findRegistration } from '../../integrations/registry'
import { createIntegrationSettingsRepository } from '../../repositories/integration-settings-repository'
import type { CommentReplicaProvider } from './comment-replica-provider'
import { CommentReplicaDisabledError } from './comment-replica-provider'

export function createCommentReplicaProviderForEvent(event: H3Event): CommentReplicaProvider {
  let resolved: Promise<CommentReplicaProvider | null> | null = null
  async function resolve() {
    const repository = createIntegrationSettingsRepository(getDatabaseClient(event))
    const row = (await repository.list()).find((candidate) =>
      candidate.capability === 'commentReplica' && candidate.enabled
      && (candidate.status === 'configured' || candidate.status === 'active'))
    if (!row) return null
    const registration = findRegistration(row.capability, row.providerKey)
    if (!registration?.createCommentReplicaProvider) return null
    let raw: unknown
    try { raw = row.publicConfigJson ? JSON.parse(row.publicConfigJson) : {} } catch { return null }
    const parsed = registration.configSchema.safeParse(raw)
    if (!parsed.success) return null
    const config = parsed.data as Record<string, unknown>
    if (registration.validate(config)) return null
    const env = event.context.cloudflare?.env ?? {}
    return registration.createCommentReplicaProvider(config, env)
  }
  return {
    providerKey: 'http',
    async replicate(replicaEvent) {
      const provider = await (resolved ??= resolve())
      if (!provider) {
        const rows = await createIntegrationSettingsRepository(getDatabaseClient(event)).list()
        const enabled = rows.some((candidate) => candidate.capability === 'commentReplica' && candidate.enabled)
        if (!enabled) throw new CommentReplicaDisabledError()
        throw new Error('Enabled comment replica is unavailable')
      }
      await provider.replicate(replicaEvent)
    }
  }
}
