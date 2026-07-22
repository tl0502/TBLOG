import type { H3Event } from 'h3'
import { getDatabaseClient } from '../../database/client'
import { createIntegrationSettingsRepository } from '../../repositories/integration-settings-repository'
import { mergeCloudflareRuntimeEnv } from '../../utils/runtime-env'
import type { CommentProtectionProvider } from './comment-protection-provider'
import { createTurnstileCommentProtectionProvider } from './turnstile-comment-protection-provider'
import { createUnavailableCommentProtectionProvider } from './unavailable-comment-protection-provider'
import { createUnconfiguredCommentProtectionProvider } from './unconfigured-comment-protection-provider'

export { mergeCloudflareRuntimeEnv as mergeCommentProtectionRuntimeEnv } from '../../utils/runtime-env'

export function createCommentProtectionProviderForEvent(event: H3Event): CommentProtectionProvider {
  let resolved: Promise<CommentProtectionProvider> | null = null

  async function resolve(): Promise<CommentProtectionProvider> {
    const repository = createIntegrationSettingsRepository(getDatabaseClient(event))
    const row = await repository.findByCapabilityAndProvider('commentProtection', 'turnstile')
    if (!row?.enabled) {
      return createUnconfiguredCommentProtectionProvider()
    }

    const env = mergeCloudflareRuntimeEnv(
      process.env,
      event.context.cloudflare?.env
    )
    const secretKey = typeof env.TURNSTILE_SECRET_KEY === 'string' ? env.TURNSTILE_SECRET_KEY : ''
    let siteKey = ''
    try {
      const config = row.publicConfigJson
        ? (JSON.parse(row.publicConfigJson) as Record<string, unknown>)
        : {}
      siteKey = typeof config.siteKey === 'string' ? config.siteKey : ''
    } catch {
      siteKey = ''
    }

    if (!secretKey || !siteKey) {
      return createUnavailableCommentProtectionProvider()
    }
    return createTurnstileCommentProtectionProvider({ secretKey })
  }

  return {
    async verify(input) {
      const provider = await (resolved ??= resolve())
      await provider.verify(input)
    }
  }
}
