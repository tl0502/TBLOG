import type { CacheProvider } from '../providers/cache/cache-provider'
import {
  isSettingsDomain,
  normalizeHomeSettings,
  toPublicSiteConfig,
  type ProfileSettings,
  type PublicSiteConfig,
  type SettingsByDomain,
  type SettingsDomain
} from '../domain/settings'
import { settingsError } from '../domain/settings-errors'
import { selectActiveCommentModerationRow } from '../providers/comment-moderation/comment-moderation-provider-factory'
import type { SettingsRepository } from '../repositories/contracts/settings-repositories'
import type { IntegrationSettingsRepository } from '../repositories/contracts/integration-repositories'
import { cacheKeys } from '../utils/cache-keys'
import { findRegistration } from '../integrations/registry'

export interface SettingsServiceDependencies {
  settingsRepository: SettingsRepository
  cache: CacheProvider
  integrationRepository?: IntegrationSettingsRepository
  env?: Record<string, unknown>
}

/**
 * Owns the domain-split configuration. Authentication is enforced by controllers (`requireAdmin`);
 * this service owns the domain resolution, persistence orchestration, cache invalidation, and the
 * public projection. Public reads must go through `getPublicSiteConfig` so no non-whitelisted field
 * can leak.
 */
export function createSettingsService(dependencies: SettingsServiceDependencies) {
  const { settingsRepository, cache } = dependencies

  function requireDomain(domain: string): SettingsDomain {
    if (!isSettingsDomain(domain)) {
      throw settingsError('invalid_domain', `Unknown settings domain "${domain}"`, 404)
    }
    return domain
  }

  async function invalidateDomain(resolved: SettingsDomain) {
    // Any settings change invalidates the public site-config projection. Site/SEO changes also
    // change feed and sitemap output (identity, base URL, robots policy), so drop those too.
    const keys = [cacheKeys.siteSettings()]
    if (resolved === 'profile' || resolved === 'home') {
      keys.push(cacheKeys.home())
    }
    if (resolved === 'site' || resolved === 'seo') {
      keys.push(cacheKeys.rss(), cacheKeys.sitemap())
    }
    await cache.delete(keys)
  }

  return {
    async getDomain<TDomain extends SettingsDomain>(domain: TDomain): Promise<SettingsByDomain[TDomain]> {
      const resolved = requireDomain(domain) as TDomain
      const value = await settingsRepository.getDomain(resolved)
      return (resolved === 'home' ? normalizeHomeSettings(value as SettingsByDomain['home']) : value) as SettingsByDomain[TDomain]
    },

    getProfileSnapshot() {
      return settingsRepository.getProfileSnapshot()
    },

    async updateProfile(input: ProfileSettings, expectedRevision: number | null) {
      const revision = await settingsRepository.saveProfileIfRevision(input, expectedRevision)
      if (revision === null) {
        throw settingsError(
          'settings_conflict',
          'Profile settings changed in another session',
          409
        )
      }
      await invalidateDomain('profile')
      return {
        value: await settingsRepository.getDomain('profile'),
        revision
      }
    },

    async updateDomain<TDomain extends SettingsDomain>(
      domain: TDomain,
      input: SettingsByDomain[TDomain]
    ): Promise<SettingsByDomain[TDomain]> {
      const resolved = requireDomain(domain) as TDomain
      let value = input
      if (resolved === 'home') {
        value = normalizeHomeSettings(input as SettingsByDomain['home']) as SettingsByDomain[TDomain]
      }
      if (resolved === 'comment') {
        const comment = input as SettingsByDomain['comment']
        if (comment.enabled && comment.autoModerationEnabled) {
          // Match runtime provider resolution: exactly one enabled+active moderation integration.
          const integrations = await dependencies.integrationRepository?.list() ?? []
          if (!selectActiveCommentModerationRow(integrations)) {
            throw settingsError(
              'integration_required',
              'Enable exactly one healthy comment moderation integration before automatic moderation',
              422
            )
          }
        }
        value = {
          ...comment,
          autoModerationEnabled: comment.enabled ? comment.autoModerationEnabled : false,
          // Turnstile site keys live under Integrations → Comment protection.
          turnstileSiteKey: null
        } as SettingsByDomain[TDomain]
      } else if (resolved === 'media') {
        value = {
          ...(input as SettingsByDomain['media']),
          imageProviderKey: null,
          urlTemplates: {},
          storageProviderStatus: null
        } as SettingsByDomain[TDomain]
      }
      await settingsRepository.saveDomain(resolved, value)
      await invalidateDomain(resolved)
      return settingsRepository.getDomain(resolved)
    },

    async getPublicSiteConfig(): Promise<PublicSiteConfig> {
      const cacheKey = cacheKeys.siteSettings()
      const cached = await cache.get<PublicSiteConfig>(cacheKey)
      if (cached !== null) return cached

      const [site, home, profile, seo, comment, integrations] = await Promise.all([
        settingsRepository.getDomain('site'),
        settingsRepository.getDomain('home'),
        settingsRepository.getDomain('profile'),
        settingsRepository.getDomain('seo'),
        settingsRepository.getDomain('comment'),
        dependencies.integrationRepository?.list() ?? Promise.resolve([])
      ])

      async function activeProjection(capability: string) {
        const candidates = integrations.filter(
          (candidate) =>
            candidate.capability === capability &&
            candidate.enabled &&
            (candidate.status === 'configured' || candidate.status === 'active')
        )
        for (const row of candidates) {
          const registration = findRegistration(row.capability, row.providerKey)
          if (!registration) continue
          let storedConfig: unknown = {}
          try {
            storedConfig = row.publicConfigJson ? JSON.parse(row.publicConfigJson) : {}
          } catch {
            continue
          }
          const parsedConfig = registration.configSchema.safeParse(storedConfig)
          if (!parsedConfig.success) continue
          const config = parsedConfig.data as Record<string, unknown>
          try {
            if (registration.validate(config)) continue
          } catch {
            continue
          }
          if (capability === 'analytics') {
            try {
              const readiness = await registration.checkStatus(config, dependencies.env ?? {})
              if (readiness.status !== 'configured' && readiness.status !== 'active') continue
            } catch {
              continue
            }
          }
          return { provider: row.providerKey, config: registration.publicProjection(config) }
        }
        return null
      }

      const [protection, analyticsProjection, imageProjection] = await Promise.all([
        activeProjection('commentProtection'),
        activeProjection('analytics'),
        activeProjection('image')
      ])
      const analytics = analyticsProjection
        ? {
            enabled: true as const,
            providerKey: analyticsProjection.provider,
            scriptUrl: typeof analyticsProjection.config.scriptUrl === 'string'
              ? analyticsProjection.config.scriptUrl
              : null,
            siteId: typeof analyticsProjection.config.siteId === 'string'
              ? analyticsProjection.config.siteId
              : null,
            renderConfig: analyticsProjection.config.renderConfig && typeof analyticsProjection.config.renderConfig === 'object'
              ? analyticsProjection.config.renderConfig as Record<string, unknown>
              : {}
          }
        : {
            enabled: false as const,
            providerKey: null,
            scriptUrl: null,
            siteId: null,
            renderConfig: {}
          }
      const siteKey = protection?.config.siteKey

      const publicConfig = toPublicSiteConfig({
        site,
        home,
        profile,
        seo,
        analytics,
        comment,
        commentProtection:
          protection && typeof siteKey === 'string' && siteKey.length > 0
            ? { provider: protection.provider, siteKey }
            : null,
        image: imageProjection
          ? {
              provider: imageProjection.provider,
              templates: {
                thumbnail:
                  typeof imageProjection.config.thumbnail === 'string'
                    ? imageProjection.config.thumbnail
                    : null,
                medium:
                  typeof imageProjection.config.medium === 'string'
                    ? imageProjection.config.medium
                    : null,
                large:
                  typeof imageProjection.config.large === 'string'
                    ? imageProjection.config.large
                    : null
              }
            }
          : null
      })
      await cache.set(cacheKey, publicConfig)
      return publicConfig
    }
  }
}

export type SettingsService = ReturnType<typeof createSettingsService>
