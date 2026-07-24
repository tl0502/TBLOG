import { ZodError } from 'zod'
import { authError } from '../domain/auth-errors'
import { integrationError } from '../domain/integration-errors'
import type { IntegrationStatus } from '../domain/integration'
import {
  findRegistration,
  listRegistrations,
  type IntegrationEnvironment,
  type ProviderRegistration
} from '../integrations/registry'
import type { IntegrationSettingsRepository } from '../repositories/contracts/integration-repositories'
import type { SearchResyncReadRepository } from '../repositories/contracts/search-repositories'
import type { SearchSyncJobRepository } from '../repositories/contracts/search-sync-repositories'
import type { SearchProvider } from '../providers/search/search-provider'
import type { CacheProvider } from '../providers/cache/cache-provider'
import type { CommentReplicaJobRepository } from '../repositories/contracts/comment-replica-repositories'
import type { CommentReplicaEvent } from '../providers/comment-replica/comment-replica-provider'
import { cacheKeys } from '../utils/cache-keys'
import type { Permission } from './permissions'

export interface ConfiguredSearchProviderParams {
  config: Record<string, unknown>
  env: IntegrationEnvironment
}

export interface IntegrationServiceDependencies {
  integrationRepository: IntegrationSettingsRepository & Required<
    Pick<IntegrationSettingsRepository, 'upsertAnalyticsReportExclusive' | 'upsertOperationalStatus'>
  >
  env: IntegrationEnvironment
  registry?: readonly ProviderRegistration[]
  now?: () => Date
  /**
   * Builds a live search provider from stored config + secrets for a manual resync, ignoring the
   * enabled flag. Returns `null` when credentials are incomplete so resync reports a clear failure
   * instead of silently succeeding against a no-op provider. Only used by the resync action.
   */
  searchProviderFactory?: (params: ConfiguredSearchProviderParams) => SearchProvider | null
  /** Reads all published articles as search records for a full index rebuild. */
  searchResyncRepository?: SearchResyncReadRepository
  /** Clears obsolete per-post retries after a successful full provider rebuild. */
  searchSyncJobRepository?: Pick<SearchSyncJobRepository, 'clearProvider'>
  cache?: CacheProvider
  commentReplicaJobRepository?: CommentReplicaJobRepository
}

export interface UpdateIntegrationCommand {
  enabled: boolean
  config: Record<string, unknown>
}

export interface IntegrationView {
  capability: string
  providerKey: string
  displayName: string
  enabled: boolean
  status: IntegrationStatus
  lastCheckedAt: Date | null
  lastError: string | null
  config: Record<string, unknown>
  requiredSecrets: string[]
  requiredBindings: string[]
  missingSecrets: string[]
  missingBindings: string[]
  formMeta: ProviderRegistration['formMeta']
  actions: NonNullable<ProviderRegistration['actions']>
}

function requireIntegrationPermission(permissions: readonly Permission[]): void {
  if (!permissions.includes('integration:*')) {
    throw authError('forbidden', 'Permission denied', 403)
  }
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function parseStoredConfig(json: string | null): Record<string, unknown> {
  if (!json) {
    return {}
  }
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function parseStoredProviderConfig(
  registration: ProviderRegistration,
  json: string | null
): { config: Record<string, unknown>; error: string | null } {
  let raw: unknown = {}
  if (json) {
    try {
      raw = JSON.parse(json)
    } catch {
      return { config: {}, error: 'Stored provider configuration is malformed' }
    }
  }

  return parseProviderConfig(registration, raw)
}

function parseProviderConfig(
  registration: ProviderRegistration,
  raw: unknown
): { config: Record<string, unknown>; error: string | null } {
  const parsed = registration.configSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      config: {},
      error: parsed.error.issues[0]?.message ?? 'Provider configuration is invalid'
    }
  }
  const config = parsed.data as Record<string, unknown>
  const validationError = registration.validate(config)
  return validationError
    ? { config: {}, error: validationError }
    : { config, error: null }
}

export function createIntegrationService(dependencies: IntegrationServiceDependencies) {
  const now = dependencies.now ?? (() => new Date())
  const registry = dependencies.registry
  const env = dependencies.env

  async function invalidatePublicProjection(capability: string): Promise<void> {
    if ((capability === 'commentProtection' || capability === 'image' || capability === 'analytics') && dependencies.cache) {
      await dependencies.cache.delete([cacheKeys.siteSettings()])
    }
  }

  function missing(names: string[]): string[] {
    return names.filter((name) => isEmpty(env[name]))
  }

  function requiredSecrets(
    registration: ProviderRegistration,
    config: Record<string, unknown>
  ): string[] {
    return registration.resolveRequiredSecrets?.(config) ?? registration.requiredSecrets
  }

  function formMetaFor(
    registration: ProviderRegistration,
    config: Record<string, unknown>
  ): ProviderRegistration['formMeta'] {
    return registration.resolveFormMeta?.(config) ?? registration.formMeta
  }

  function mergeServerManagedConfig(
    registration: ProviderRegistration,
    next: Record<string, unknown>,
    previous: Record<string, unknown>,
    rawCommandConfig: Record<string, unknown>
  ): Record<string, unknown> {
    const keys = registration.serverManagedConfigKeys
    if (!keys?.length) return next
    const merged = { ...next }
    for (const key of keys) {
      if (!(key in rawCommandConfig) && key in previous) {
        merged[key] = previous[key]
      }
    }
    return merged
  }

  function buildView(
    registration: ProviderRegistration,
    state: {
      enabled: boolean
      config: Record<string, unknown>
      status: IntegrationStatus
      lastCheckedAt: Date | null
      lastError: string | null
    }
  ): IntegrationView {
    const secrets = requiredSecrets(registration, state.config)
    return {
      capability: registration.capability,
      providerKey: registration.providerKey,
      displayName: registration.displayName,
      enabled: state.enabled,
      status: state.status,
      lastCheckedAt: state.lastCheckedAt,
      lastError: state.lastError,
      config: registration.publicProjection(state.config),
      requiredSecrets: secrets,
      requiredBindings: registration.requiredBindings,
      missingSecrets: missing(secrets),
      missingBindings: missing(registration.requiredBindings),
      formMeta: formMetaFor(registration, state.config),
      actions: registration.actions ?? []
    }
  }

  function requireRegistration(capability: string, providerKey: string): ProviderRegistration {
    const registration = findRegistration(capability, providerKey, registry)
    if (!registration) {
      throw integrationError('provider_not_found', 'Integration provider not found', 404)
    }
    return registration
  }

  return {
    async list(permissions: readonly Permission[]): Promise<IntegrationView[]> {
      requireIntegrationPermission(permissions)

      const rows = await dependencies.integrationRepository.list()
      const byKey = new Map(rows.map((row) => [`${row.capability}:${row.providerKey}`, row]))

      return listRegistrations(registry).map((registration) => {
        const row = byKey.get(`${registration.capability}:${registration.providerKey}`)
        const parsed = parseStoredProviderConfig(registration, row?.publicConfigJson ?? null)
        return buildView(registration, {
          enabled: parsed.error ? false : (row?.enabled ?? false),
          config: parsed.config,
          status: parsed.error ? 'misconfigured' : (row?.status ?? 'disabled'),
          lastCheckedAt: row?.lastCheckedAt ?? null,
          lastError: parsed.error ?? row?.lastError ?? null
        })
      })
    },

    async update(
      capability: string,
      providerKey: string,
      command: UpdateIntegrationCommand,
      permissions: readonly Permission[]
    ): Promise<IntegrationView> {
      requireIntegrationPermission(permissions)
      const registration = requireRegistration(capability, providerKey)

      const previousRow = await dependencies.integrationRepository.findByCapabilityAndProvider(
        registration.capability,
        registration.providerKey
      )
      const previousParsed = parseStoredProviderConfig(
        registration,
        previousRow?.publicConfigJson ?? null
      )

      let config: Record<string, unknown>
      try {
        config = registration.configSchema.parse(command.config) as Record<string, unknown>
      } catch (error) {
        if (error instanceof ZodError) {
          throw integrationError(
            'invalid_config',
            error.issues[0]?.message ?? 'Invalid provider configuration',
            422,
            { issues: error.issues }
          )
        }
        throw error
      }
      config = mergeServerManagedConfig(
        registration,
        config,
        previousParsed.config,
        command.config
      )

      const validationError = registration.validate(config)
      if (validationError) {
        throw integrationError('invalid_config', validationError, 422)
      }

      const timestamp = now()
      let enabled = command.enabled
      let status: IntegrationStatus
      let lastError: string | null = null
      const formMeta = formMetaFor(registration, config)

      if (command.enabled) {
        const secrets = requiredSecrets(registration, config)
        const missingFields = formMeta
          .filter((field) => field.required && isEmpty(config[field.key]))
          .map((field) => field.key)
        const missingRequirements = [
          ...missing(secrets),
          ...missing(registration.requiredBindings)
        ]

        if (missingFields.length > 0) {
          // Cannot enable without the required public fields; keep disabled and explain.
          enabled = false
          status = 'misconfigured'
          lastError = `Missing required fields: ${missingFields.join(', ')}`
        } else if (missingRequirements.length > 0) {
          // Secrets or bindings are absent; save the config but keep the feature off.
          enabled = false
          status = 'unavailable'
          lastError = `Missing required secrets or bindings: ${missingRequirements.join(', ')}`
        } else {
          status = 'configured'
        }
      } else {
        status = 'disabled'
      }

      // Analytics collection and report providers are readiness-sensitive. Probe the registration
      // before enabling so missing deployment requirements cannot look healthy in public projection.
      if ((registration.capability === 'analytics' || registration.capability === 'analyticsReport' || registration.capability === 'search') && enabled) {
        const readiness = await registration.checkStatus(config, env)
        if (readiness.status === 'unavailable' || readiness.status === 'misconfigured') {
          enabled = false
          status = readiness.status
          lastError = readiness.error ?? null
        }
      }

      const record = {
        capability: registration.capability,
        providerKey: registration.providerKey,
        enabled,
        publicConfigJson: JSON.stringify(config),
        status,
        lastCheckedAt: null,
        lastError,
        updatedAt: timestamp
      }
      if (registration.capability === 'analyticsReport') {
        await dependencies.integrationRepository.upsertAnalyticsReportExclusive(record)
      } else if (
        (registration.capability === 'analytics' || registration.capability === 'commentModeration')
        && enabled
      ) {
        await dependencies.integrationRepository.upsertExclusive(record, registration.capability)
      } else {
        await dependencies.integrationRepository.upsert(record)
      }
      await invalidatePublicProjection(registration.capability)

      return buildView(registration, {
        enabled,
        config,
        status,
        lastCheckedAt: null,
        lastError
      })
    },

    async getPublicSearchConfig(): Promise<{
      enabled: boolean
      provider: string | null
      config: Record<string, unknown> | null
    }> {
      const rows = await dependencies.integrationRepository.list()
      // Search read readiness is independent from write-side synchronization health. A transient
      // indexing failure may set a warning status for administrators, but the existing public index
      // and search-only credentials remain usable and must not disappear from the public UI.
      const active = rows.find((row) => row.capability === 'search' && row.enabled === true)

      if (!active) {
        return { enabled: false, provider: null, config: null }
      }

      const registration = findRegistration(active.capability, active.providerKey, registry)
      if (!registration) {
        return { enabled: false, provider: null, config: null }
      }

      const storedConfig = parseStoredConfig(active.publicConfigJson)
      const parsedConfig = registration.configSchema.safeParse(storedConfig)
      if (!parsedConfig.success) {
        return { enabled: false, provider: null, config: null }
      }
      const config = parsedConfig.data as Record<string, unknown>
      const missingRequiredField = registration.formMeta.some(
        (field) => field.required && isEmpty(config[field.key])
      )
      if (missingRequiredField || registration.validate(config)) {
        return { enabled: false, provider: null, config: null }
      }

      // Provider-owned fail-closed guards protect legacy rows without branching on provider names.
      if (registration.validatePublicProjection?.(config, env)) {
        return { enabled: false, provider: null, config: null }
      }

      return {
        enabled: true,
        provider: active.providerKey,
        config: registration.publicProjection(config)
      }
    },

    async runAction(
      capability: string,
      providerKey: string,
      actionKey: string,
      permissions: readonly Permission[],
      /** Optional unsaved form draft; merged over stored public config for actions like listModels. */
      draftConfig?: Record<string, unknown>
    ): Promise<IntegrationView> {
      requireIntegrationPermission(permissions)
      const registration = requireRegistration(capability, providerKey)

      const action = registration.actions?.find((candidate) => candidate.key === actionKey)
      if (!action) {
        throw integrationError('action_not_found', 'Integration action not found', 404)
      }

      const row = await dependencies.integrationRepository.findByCapabilityAndProvider(
        registration.capability,
        registration.providerKey
      )
      const storedRaw = parseStoredConfig(row?.publicConfigJson ?? null)
      const mergedRaw = draftConfig && Object.keys(draftConfig).length > 0
        ? { ...storedRaw, ...draftConfig }
        : storedRaw
      const parsed = parseProviderConfig(registration, mergedRaw)
      let config = parsed.config
      const timestamp = now()

      let status: IntegrationStatus
      let lastError: string | null
      let publicConfigJson = row?.publicConfigJson ?? JSON.stringify(config)

      if (parsed.error) {
        status = 'misconfigured'
        lastError = parsed.error
      } else {
        const handled = registration.executeAction
          ? await registration.executeAction(actionKey, config, env)
          : null

        if (handled) {
          config = handled.config
          publicConfigJson = JSON.stringify(config)
          status = !row?.enabled && (handled.status === 'active' || handled.status === 'configured')
            ? 'disabled'
            : handled.status
          lastError = handled.error ?? null
        } else if (
          registration.capability === 'search'
          && actionKey === 'resync'
          && dependencies.searchProviderFactory
          && dependencies.searchResyncRepository
        ) {
          // Full index rebuild. Resync can be triggered manually even when the row is not marked
          // enabled — readiness is decided solely by complete config + admin secret. A failing
          // rebuild must not corrupt core state, so provider errors are captured as retryable state.
          const provider = dependencies.searchProviderFactory({ config, env })
          if (!provider) {
            // Credentials incomplete: never report a rebuild that did nothing as success.
            status = 'misconfigured'
            lastError = 'Search is not fully configured (missing app id, index name, or admin key)'
          } else {
            try {
              const records = await dependencies.searchResyncRepository.listAllPublishedSearchRecords()
              await provider.replaceAllRecords(records)
              await dependencies.searchSyncJobRepository?.clearProvider(registration.providerKey)
              status = 'active'
              lastError = null
            } catch (error) {
              status = 'misconfigured'
              lastError = error instanceof Error ? error.message : 'Search resync failed'
            }
          }
        } else if (
          registration.capability === 'cache'
          && actionKey === 'purge'
          && dependencies.cache
        ) {
          // Rotate the full cache generation so every public projection under the previous
          // prefix becomes unreachable. Binding/readiness is still reported via checkStatus.
          try {
            await dependencies.cache.delete([], { forceGeneration: true })
            const readiness = await registration.checkStatus(config, env)
            status = !row?.enabled && (readiness.status === 'active' || readiness.status === 'configured')
              ? 'disabled'
              : readiness.status
            lastError = readiness.error ?? null
          } catch (error) {
            status = 'unavailable'
            lastError = error instanceof Error ? error.message : 'Cache purge failed'
          }
        } else if (
          registration.capability === 'commentReplica'
          && actionKey === 'retry'
          && dependencies.commentReplicaJobRepository
          && registration.createCommentReplicaProvider
        ) {
          const provider = registration.createCommentReplicaProvider(config, env)
          if (!provider) {
            status = 'misconfigured'
            lastError = 'Comment replica is not fully configured'
          } else {
            const jobs = await dependencies.commentReplicaJobRepository.listProviderJobs(providerKey, 20)
            let failed = 0
            for (const job of jobs) {
              try {
                const event = JSON.parse(job.payloadJson) as CommentReplicaEvent
                await provider.replicate(event)
                await dependencies.commentReplicaJobRepository.complete(job.id, job.revision)
              } catch (error) {
                failed += 1
                await dependencies.commentReplicaJobRepository.fail(
                  job.id,
                  job.revision,
                  error instanceof Error ? error.message : 'Replica retry failed',
                  timestamp
                )
              }
            }
            status = failed === 0 ? 'active' : 'unavailable'
            lastError = failed === 0 ? null : `${failed} comment replica jobs failed`
          }
        } else {
          try {
            const result = await registration.checkStatus(config, env)
            status = !row?.enabled && (result.status === 'active' || result.status === 'configured')
              ? 'disabled'
              : result.status
            lastError = result.error ?? null
          } catch (error) {
            // A failing probe must not corrupt core state; surface it as retryable state instead.
            status = 'misconfigured'
            lastError = error instanceof Error ? error.message : 'Integration check failed'
          }
        }
      }

      await dependencies.integrationRepository.upsertOperationalStatus({
        capability: registration.capability,
        providerKey: registration.providerKey,
        enabled: row?.enabled ?? false,
        publicConfigJson,
        status,
        lastCheckedAt: timestamp,
        lastError,
        updatedAt: timestamp
      })
      await invalidatePublicProjection(registration.capability)

      return buildView(registration, {
        enabled: row?.enabled ?? false,
        config,
        status,
        lastCheckedAt: timestamp,
        lastError
      })
    }
  }
}

export type IntegrationService = ReturnType<typeof createIntegrationService>
