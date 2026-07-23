import type { ZodTypeAny } from 'zod'
import type { IntegrationCapability, IntegrationStatus } from '../domain/integration'
import type { CommentModerationProvider } from '../providers/comment-moderation/comment-moderation-provider'
import type { CommentReplicaProvider } from '../providers/comment-replica/comment-replica-provider'
import type { AnalyticsReportProvider } from '../providers/analytics-report/analytics-report-provider'
import { turnstileRegistration } from './providers/turnstile'
import { algoliaRegistration } from './providers/algolia'
import { cloudflareKvCacheRegistration } from './providers/cloudflare-kv-cache'
import { cloudflareR2StorageRegistration } from './providers/cloudflare-r2-storage'
import { imageUrlTemplateRegistration } from './providers/image-url-template'
import { openAiCommentModerationRegistration } from './providers/openai-comment-moderation'
import { httpCommentModerationRegistration } from './providers/http-comment-moderation'
import { analyticsRegistrations } from './providers/analytics'
import { httpCommentReplicaRegistration } from './providers/http-comment-replica'
import { httpAnalyticsReportRegistration } from './providers/http-analytics-report'
import { plausibleAnalyticsReportRegistration } from './providers/plausible-analytics-report'
import { umamiAnalyticsReportRegistration } from './providers/umami-analytics-report'

/**
 * Non-secret configuration values passed to providers. This is the Cloudflare `env` for the request,
 * so it also carries secret bindings (e.g. `TURNSTILE_SECRET_KEY`) and Cloudflare resource bindings
 * (e.g. `DB`, `R2`). Providers read secrets from here but never persist them into D1.
 */
export type IntegrationEnvironment = Record<string, unknown>

export interface IntegrationStatusResult {
  status: IntegrationStatus
  error?: string
}

export type FormFieldType = 'text' | 'url' | 'password' | 'boolean' | 'select'

export interface FormFieldOption {
  value: string
  label: string
}

/** Field-level metadata that drives the admin form renderer for one provider config field. */
export interface FormFieldMeta {
  key: string
  label: string
  type: FormFieldType
  placeholder?: string
  help?: string
  required: boolean
  options?: FormFieldOption[]
  persist?: boolean
  visibleWhen?: { key: string; value: string }
}

export interface ProviderAction {
  key: string
  label: string
  kind?: 'status' | 'client'
  clientHandler?: 'umamiSelfHostedCredential'
  visibleWhen?: { key: string; value: string }
}

/**
 * A single provider registration. Adding a provider means adding one of these to the registry, not
 * editing unrelated UI pages. `configSchema` validates the shape of the public config; `validate`
 * performs provider-specific cross-field checks; `checkStatus` probes live readiness against `env`.
 */
export interface ProviderActionResult {
  config: Record<string, unknown>
  status: IntegrationStatus
  error?: string | null
}

export interface ProviderRegistration {
  capability: IntegrationCapability
  providerKey: string
  displayName: string
  configSchema: ZodTypeAny
  validate(config: Record<string, unknown>): string | null
  checkStatus(
    config: Record<string, unknown>,
    env: IntegrationEnvironment
  ): IntegrationStatusResult | Promise<IntegrationStatusResult>
  publicProjection(config: Record<string, unknown>): Record<string, unknown>
  /** Optional fail-closed guard for legacy public rows whose stored projection is no longer safe. */
  validatePublicProjection?(
    config: Record<string, unknown>,
    env: IntegrationEnvironment
  ): string | null
  /** Resolve mode-dependent secret requirements from normalized public configuration. */
  resolveRequiredSecrets?(config: Record<string, unknown>): string[]
  /**
   * Keys written by server actions (or other non-form writers) that client saves must not wipe.
   * When a client update omits these keys, the previously stored values are preserved.
   */
  serverManagedConfigKeys?: string[]
  /** Optional per-config form metadata (e.g. model suggestion menus after Detect Models). */
  resolveFormMeta?(config: Record<string, unknown>): FormFieldMeta[]
  /**
   * Optional custom action handler. Return null to fall through to the default status probe.
   * When non-null, the service persists `config` and surfaces `status` / `error`.
   */
  executeAction?(
    actionKey: string,
    config: Record<string, unknown>,
    env: IntegrationEnvironment
  ): ProviderActionResult | Promise<ProviderActionResult | null> | null
  requiredSecrets: string[]
  requiredBindings: string[]
  formMeta: FormFieldMeta[]
  actions?: ProviderAction[]
  createAnalyticsReportProvider?: (
    config: Record<string, unknown>,
    env: IntegrationEnvironment
  ) => AnalyticsReportProvider | null
  /** Optional server-side adapter builder for the commentModeration capability. */
  createCommentModerationProvider?: (
    config: Record<string, unknown>,
    env: IntegrationEnvironment
  ) => CommentModerationProvider | null
  createCommentReplicaProvider?: (
    config: Record<string, unknown>,
    env: IntegrationEnvironment
  ) => CommentReplicaProvider | null
}

export const integrationRegistry: readonly ProviderRegistration[] = [
  turnstileRegistration,
  algoliaRegistration,
  imageUrlTemplateRegistration,
  cloudflareR2StorageRegistration,
  cloudflareKvCacheRegistration,
  openAiCommentModerationRegistration,
  httpCommentModerationRegistration,
  httpCommentReplicaRegistration,
  umamiAnalyticsReportRegistration,
  plausibleAnalyticsReportRegistration,
  httpAnalyticsReportRegistration,
  ...analyticsRegistrations
]

export function listRegistrations(
  registry: readonly ProviderRegistration[] = integrationRegistry
): readonly ProviderRegistration[] {
  return registry
}

export function listRegistrationsByCapability(
  capability: IntegrationCapability,
  registry: readonly ProviderRegistration[] = integrationRegistry
): ProviderRegistration[] {
  return registry.filter((registration) => registration.capability === capability)
}

export function findRegistration(
  capability: string,
  providerKey: string,
  registry: readonly ProviderRegistration[] = integrationRegistry
): ProviderRegistration | null {
  return (
    registry.find(
      (registration) =>
        registration.capability === capability && registration.providerKey === providerKey
    ) ?? null
  )
}
