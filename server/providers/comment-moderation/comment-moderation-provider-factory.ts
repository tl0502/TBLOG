import type { H3Event } from 'h3'
import { getDatabaseClient } from '../../database/client'
import { findRegistration } from '../../integrations/registry'
import { createIntegrationSettingsRepository } from '../../repositories/integration-settings-repository'
import type { StoredIntegration } from '../../repositories/contracts/integration-repositories'
import { mergeCloudflareRuntimeEnv } from '../../utils/runtime-env'
import type { CommentModerationProvider } from './comment-moderation-provider'
import { createUnconfiguredCommentModerationProvider } from './unconfigured-comment-moderation-provider'

export { mergeCloudflareRuntimeEnv as mergeCommentModerationRuntimeEnv } from '../../utils/runtime-env'

function parseConfig(raw: string | null): Record<string, unknown> | null {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return null
  }
}

export function selectActiveCommentModerationRow(
  rows: readonly StoredIntegration[]
): StoredIntegration | null {
  const active = rows.filter((candidate) =>
    candidate.capability === 'commentModeration'
    && candidate.enabled
    && candidate.status === 'active'
  )
  return active.length === 1 ? active[0]! : null
}

export function createCommentModerationProviderForEvent(event: H3Event): CommentModerationProvider {
  let resolved: Promise<{ provider: CommentModerationProvider, providerKey: string }> | null = null

  async function resolve(): Promise<{ provider: CommentModerationProvider, providerKey: string }> {
    const repository = createIntegrationSettingsRepository(getDatabaseClient(event))
    const row = selectActiveCommentModerationRow(await repository.list())
    const registration = row ? findRegistration(row.capability, row.providerKey) : null
    const env = mergeCloudflareRuntimeEnv(
      process.env,
      event.context.cloudflare?.env
    )
    const rawConfig = row ? parseConfig(row.publicConfigJson) : null
    const parsedConfig = rawConfig && registration
      ? registration.configSchema.safeParse(rawConfig)
      : null
    const normalizedConfig = parsedConfig?.success
      ? parsedConfig.data as Record<string, unknown>
      : null
    const provider = normalizedConfig && registration && !registration.validate(normalizedConfig)
      ? registration.createCommentModerationProvider?.(normalizedConfig, env) ?? null
      : null
    return provider && row
      ? { provider, providerKey: row.providerKey }
      : { provider: createUnconfiguredCommentModerationProvider(), providerKey: 'unconfigured' }
  }

  const runtimeProvider: CommentModerationProvider = {
    providerKey: 'unconfigured',
    async moderate(input) {
      const runtime = await (resolved ??= resolve())
      Object.defineProperty(runtimeProvider, 'providerKey', {
        configurable: true,
        enumerable: true,
        value: runtime.providerKey
      })
      return runtime.provider.moderate(input)
    }
  }
  return runtimeProvider
}
