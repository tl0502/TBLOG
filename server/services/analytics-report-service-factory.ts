import type { H3Event } from 'h3'
import { createDatabaseClient } from '../database/client'
import { findRegistration } from '../integrations/registry'
import { createAnalyticsReportStateRepository } from '../repositories/analytics-report-state-repository'
import { createIntegrationSettingsRepository } from '../repositories/integration-settings-repository'
import { createPostReadRepository } from '../repositories/post-read-repository'
import type { StoredIntegration } from '../repositories/contracts/integration-repositories'
import { mergeCloudflareRuntimeEnv } from '../utils/runtime-env'
import { createAnalyticsReportService } from './analytics-report-service'

export { mergeCloudflareRuntimeEnv as mergeAnalyticsReportRuntimeEnv } from '../utils/runtime-env'

export function createAnalyticsReportServiceForEvent(event: H3Event) {
  const binding = event.context.cloudflare?.env?.DB
  if (!binding) throw new Error('D1 binding DB is not available')
  return createAnalyticsReportServiceForBindings({
    ...event.context.cloudflare?.env,
    DB: binding
  })
}

export function createAnalyticsReportServiceForBindings(
  bindings: Record<string, unknown> & { DB: D1Database }
) {
  const db = createDatabaseClient(bindings.DB)
  return createAnalyticsReportService({
    stateRepository: createAnalyticsReportStateRepository(db),
    integrationRepository: createIntegrationSettingsRepository(db),
    articleRepository: createPostReadRepository(db),
    createProvider(integration: StoredIntegration) {
      const registration = findRegistration(integration.capability, integration.providerKey)
      if (!registration?.createAnalyticsReportProvider) return null
      const env = mergeCloudflareRuntimeEnv(
        process.env,
        bindings
      )
      let config: unknown = {}
      try { config = integration.publicConfigJson ? JSON.parse(integration.publicConfigJson) : {} } catch { return null }
      const parsed = registration.configSchema.safeParse(config)
      if (!parsed.success) return null
      const normalized = parsed.data as Record<string, unknown>
      if (registration.validate(normalized)) return null
      return registration.createAnalyticsReportProvider(normalized, env)
    }
  })
}
