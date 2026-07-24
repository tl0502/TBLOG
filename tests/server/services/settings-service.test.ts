import { vi } from 'vitest'
import { createSettingsService } from '../../../server/services/settings-service'
import { settingsDefaults, type SettingsByDomain, type SettingsDomain } from '../../../server/domain/settings'
import { SettingsDomainError } from '../../../server/domain/settings-errors'
import type { CacheProvider } from '../../../server/providers/cache/cache-provider'
import type { SettingsRepository } from '../../../server/repositories/contracts/settings-repositories'
import type { IntegrationSettingsRepository } from '../../../server/repositories/contracts/integration-repositories'

function createFakeRepo() {
  const store = new Map<SettingsDomain, unknown>()
  let profileRevision: number | null = null
  const getDomain = vi.fn()
  const repository: SettingsRepository = {
    async getDomain(domain) {
      getDomain(domain)
      return (store.get(domain) ?? settingsDefaults[domain]) as never
    },
    async getProfileSnapshot() {
      return {
        value: (store.get('profile') ?? settingsDefaults.profile) as SettingsByDomain['profile'],
        revision: profileRevision
      }
    },
    async saveDomain(domain, value) {
      store.set(domain, value)
      if (domain === 'profile') profileRevision = (profileRevision ?? 0) + 1
    },
    async saveProfileIfRevision(value, expectedRevision) {
      if (expectedRevision !== profileRevision) return null
      profileRevision = (profileRevision ?? 0) + 1
      store.set('profile', value)
      return profileRevision
    }
  }
  return { repository, store, getDomain }
}

function createFakeCache(deleteFn = vi.fn().mockResolvedValue(undefined)) {
  const store = new Map<string, unknown>()
  const get = vi.fn()
  const set = vi.fn()
  const cache: CacheProvider = {
    async get<T>(key: string) {
      get(key)
      return (store.has(key) ? store.get(key) : null) as T | null
    },
    async set<T>(key: string, value: T) {
      set(key, value)
      store.set(key, value)
    },
    async delete(keys: string[]) {
      await deleteFn(keys)
    }
  }
  return { cache, get, set, store }
}

function createService(overrides: { delete?: ReturnType<typeof vi.fn>; env?: Record<string, unknown> } = {}) {
  const { repository, store, getDomain } = createFakeRepo()
  const cacheDelete = overrides.delete ?? vi.fn().mockResolvedValue(undefined)
  const { cache, get: cacheGet, set: cacheSet } = createFakeCache(cacheDelete)
  const service = createSettingsService({ settingsRepository: repository, cache, env: overrides.env })
  return { service, store, repository, getDomain, cacheDelete, cacheGet, cacheSet }
}

describe('settings service', () => {
  it('returns defaults for a known domain that has no persisted row', async () => {
    const { service } = createService()
    expect(await service.getDomain('seo')).toEqual(settingsDefaults.seo)
  })

  it('rejects an unknown domain with a 404 invalid_domain error', async () => {
    const { service } = createService()
    await expect(service.getDomain('nope' as SettingsDomain)).rejects.toMatchObject({
      code: 'invalid_domain',
      statusCode: 404
    })
    await expect(service.getDomain('nope' as SettingsDomain)).rejects.toBeInstanceOf(SettingsDomainError)
  })

  it('persists an update and invalidates the site-settings cache resource', async () => {
    const { service, store, cacheDelete } = createService()
    const next: SettingsByDomain['site'] = { ...settingsDefaults.site, siteName: 'Updated' }

    const result = await service.updateDomain('site', next)

    expect(result).toEqual(next)
    expect(store.get('site')).toEqual(next)
    // Site identity feeds the RSS/sitemap output, so those resources are invalidated too.
    expect(cacheDelete).toHaveBeenCalledWith(['site-settings', 'rss', 'sitemap'])
  })

  it('invalidates the feed and sitemap resources when SEO settings change', async () => {
    const { service, cacheDelete } = createService()

    await service.updateDomain('seo', { ...settingsDefaults.seo, robotsPolicy: 'noindex,nofollow' })

    expect(cacheDelete).toHaveBeenCalledWith(['site-settings', 'rss', 'sitemap'])
  })

  it('invalidates both the public site-config and homepage when the profile changes', async () => {
    const { service, cacheDelete } = createService()

    await service.updateDomain('profile', { ...settingsDefaults.profile, name: 'Updated author' })

    expect(cacheDelete).toHaveBeenCalledWith(['site-settings', 'home:v2'])
  })

  it('conditionally updates profile settings and rejects a stale revision', async () => {
    const { service, store, cacheDelete } = createService()
    const first = await service.updateProfile({ ...settingsDefaults.profile, name: 'First' }, null)

    expect(first).toMatchObject({ value: { name: 'First' }, revision: 1 })
    await expect(
      service.updateProfile({ ...settingsDefaults.profile, name: 'Stale' }, null)
    ).rejects.toMatchObject({ code: 'settings_conflict', statusCode: 409 })
    expect((store.get('profile') as SettingsByDomain['profile']).name).toBe('First')
    expect(cacheDelete).toHaveBeenCalledTimes(1)
  })

  it('invalidates both the public site-config and homepage when home cards change', async () => {
    const { service, cacheDelete } = createService()

    await service.updateDomain('home', { railCards: [] })

    expect(cacheDelete).toHaveBeenCalledWith(['site-settings', 'home:v2'])
  })

  it('refuses to enable automatic moderation without a healthy integration', async () => {
    const { service, store } = createService()

    await expect(
      service.updateDomain('comment', {
        ...settingsDefaults.comment,
        autoModerationEnabled: true
      })
    ).rejects.toMatchObject({ code: 'integration_required', statusCode: 422 })
    expect(store.has('comment')).toBe(false)
  })

  it('allows comments to be disabled without a healthy moderation integration and clears the policy', async () => {
    const { service, store } = createService()

    await expect(service.updateDomain('comment', {
      ...settingsDefaults.comment,
      enabled: false,
      autoModerationEnabled: true
    })).resolves.toMatchObject({ enabled: false, autoModerationEnabled: false })
    expect(store.get('comment')).toMatchObject({ enabled: false, autoModerationEnabled: false })
  })

  it('persists the configured comment rate-limit policy', async () => {
    const { service, store } = createService()

    await expect(service.updateDomain('comment', {
      ...settingsDefaults.comment,
      rateLimit: { windowSeconds: 300, maxPerWindow: 12 }
    })).resolves.toMatchObject({
      rateLimit: { windowSeconds: 300, maxPerWindow: 12 }
    })
    expect(store.get('comment')).toMatchObject({
      rateLimit: { windowSeconds: 300, maxPerWindow: 12 }
    })
  })

  it('persists automatic moderation when its integration is enabled and healthy', async () => {
    const { repository, store } = createFakeRepo()
    const integrationRepository: IntegrationSettingsRepository = {
      async list() {
        return [{
          capability: 'commentModeration', providerKey: 'http', enabled: true,
          publicConfigJson: JSON.stringify({ endpoint: 'https://moderation.example.com' }),
          status: 'active', lastCheckedAt: new Date(), lastError: null, updatedAt: new Date()
        }]
      },
      async findByCapabilityAndProvider() { return null },
      async upsert() {},
      async upsertExclusive() {},
      async touch() {}
    }
    const service = createSettingsService({
      settingsRepository: repository,
      integrationRepository,
      cache: createFakeCache().cache
    })

    await service.updateDomain('comment', {
      ...settingsDefaults.comment,
      autoModerationEnabled: true
    })

    expect(store.get('comment')).toMatchObject({ autoModerationEnabled: true })
  })

  it('refuses automatic moderation when more than one moderation integration is active', async () => {
    const { repository, store } = createFakeRepo()
    const integrationRepository: IntegrationSettingsRepository = {
      async list() {
        return [
          {
            capability: 'commentModeration', providerKey: 'http', enabled: true,
            publicConfigJson: JSON.stringify({ endpoint: 'https://moderation.example.com' }),
            status: 'active', lastCheckedAt: new Date(), lastError: null, updatedAt: new Date()
          },
          {
            capability: 'commentModeration', providerKey: 'openai', enabled: true,
            publicConfigJson: JSON.stringify({ model: 'gpt-4.1-mini' }),
            status: 'active', lastCheckedAt: new Date(), lastError: null, updatedAt: new Date()
          }
        ]
      },
      async findByCapabilityAndProvider() { return null },
      async upsert() {},
      async upsertExclusive() {},
      async touch() {}
    }
    const service = createSettingsService({
      settingsRepository: repository,
      integrationRepository,
      cache: createFakeCache().cache
    })

    await expect(service.updateDomain('comment', {
      ...settingsDefaults.comment,
      autoModerationEnabled: true
    })).rejects.toMatchObject({ code: 'integration_required', statusCode: 422 })
    expect(store.has('comment')).toBe(false)
  })

  it('reads the public site projection through the site-settings cache', async () => {
    const { service, getDomain, cacheGet, cacheSet } = createService()

    const first = await service.getPublicSiteConfig()
    const second = await service.getPublicSiteConfig()

    expect(second).toEqual(first)
    expect(cacheGet).toHaveBeenCalledTimes(2)
    expect(cacheSet).toHaveBeenCalledOnce()
    expect(cacheSet).toHaveBeenCalledWith('site-settings', first)
    expect(getDomain).toHaveBeenCalledTimes(5)
  })

  it('omits stored public integration config that fails schema parsing or provider validation', async () => {
    const { repository } = createFakeRepo()
    const integrationRepository: IntegrationSettingsRepository = {
      async list() {
        return [
          {
            capability: 'commentProtection', providerKey: 'turnstile', enabled: true,
            publicConfigJson: '{bad json', status: 'active' as const,
            lastCheckedAt: null, lastError: null, updatedAt: new Date()
          },
          {
            capability: 'image', providerKey: 'url-template', enabled: true,
            publicConfigJson: JSON.stringify({ thumbnail: 'https://img.example/static.png' }),
            status: 'active' as const, lastCheckedAt: null, lastError: null, updatedAt: new Date()
          }
        ]
      },
      async findByCapabilityAndProvider() { return null },
      async upsert() {},
      async upsertExclusive() {},
      async touch() {}
    }
    const service = createSettingsService({
      settingsRepository: repository,
      integrationRepository,
      cache: createFakeCache().cache
    })

    const config = await service.getPublicSiteConfig()

    expect(config.comment.protection).toBeNull()
    expect(config.image).toBeNull()
  })

  it('projects only whitelisted public fields and hides non-public settings', async () => {
    const { service } = createService()
    await service.updateDomain('site', {
      ...settingsDefaults.site,
      siteName: 'Public Blog',
      lightTheme: 'atelier',
      navigation: [{ label: 'Home', href: '/' }],
      socialLinks: [{ platform: 'x', url: 'https://x/y' }]
    })
    const config = await service.getPublicSiteConfig()

    expect(config.site).toEqual({
      siteName: 'Public Blog',
      description: null,
      logoUrl: null,
      faviconUrl: null,
      featuredFallbackCover: null,
      lightTheme: 'atelier',
      navigation: [{ label: 'Home', href: '/' }],
      socialLinks: [{ platform: 'x', url: 'https://x/y' }],
      locale: 'zh-CN'
    })
    expect(config.analytics).toEqual({ enabled: false })
    expect(config.home.railCards.map((card) => card.type)).toEqual(['tags', 'build-log'])
    expect(JSON.stringify(config.home)).not.toContain('enabled')
    // Security/media/search domains have no public projection at all.
    expect(Object.keys(config).sort()).toEqual(['analytics', 'comment', 'home', 'image', 'profile', 'seo', 'site'])
  })

  it('projects only visible profile lists in configured order', async () => {
    const { service } = createService()
    await service.updateDomain('profile', {
      ...settingsDefaults.profile,
      socialLinks: [
        { platform: 'hidden', url: 'https://hidden.example', visible: false, sortOrder: 0 },
        { platform: 'rss', url: '/rss.xml', visible: true, sortOrder: 2 },
        { platform: 'github', url: 'https://github.com/tblog', visible: true, sortOrder: 1 }
      ],
      projects: [
        { name: 'Later', description: '', status: 'Active', tags: [], url: null, visible: true, sortOrder: 2 },
        { name: 'Hidden', description: '', status: 'Draft', tags: [], url: null, visible: false, sortOrder: 0 },
        { name: 'First', description: '', status: 'Active', tags: ['Nuxt'], url: '/', visible: true, sortOrder: 1 }
      ],
      journeyEnabled: false,
      journey: [
        { period: 'Now', title: 'Hidden while disabled', role: '', description: '', visible: true, sortOrder: 0 }
      ]
    })

    const profile = (await service.getPublicSiteConfig()).profile

    expect(profile.socialLinks).toEqual([
      { platform: 'github', url: 'https://github.com/tblog' },
      { platform: 'rss', url: '/rss.xml' }
    ])
    expect(profile.projects.map((project) => project.name)).toEqual(['First', 'Later'])
    expect(profile.journeyEnabled).toBe(false)
    expect(profile.journey).toEqual([])
    expect(JSON.stringify(profile)).not.toContain('hidden.example')
    expect(JSON.stringify(profile)).not.toContain('sortOrder')
    expect(JSON.stringify(profile)).not.toContain('visible')
  })

  it('keeps only explicitly configured home cards and strips private curation controls from the public projection', async () => {
    const { service } = createService()
    await service.updateDomain('home', {
      railCards: [{
        instanceId: 'topic-1', type: 'curated-topic', enabled: true, size: 'normal', title: 'Topic', eyebrow: 'CURATED',
        topicTitle: 'Public topic', summary: '', coverUrl: null, targetUrl: '/archive',
        articleSlugs: ['published', 'draft-secret']
      }]
    })

    const admin = await service.getDomain('home')
    const publicHome = (await service.getPublicSiteConfig()).home

    expect(admin.railCards).toHaveLength(1)
    expect(publicHome.railCards.map((card) => card.type)).toContain('curated-topic')
    expect(JSON.stringify(publicHome)).not.toContain('draft-secret')
    expect(JSON.stringify(publicHome)).not.toContain('articleSlugs')
  })

  it('whitelists stored home card fields and removes unsafe persisted URLs from the public projection', async () => {
    const { service, store } = createService()
    store.set('home', { railCards: [{
      instanceId: 'nav-unsafe', type: 'navigation', enabled: true, size: 'normal', title: 'Links',
      internalSecret: 'do-not-expose',
      groups: [{ label: 'Links', links: [
        { label: 'Safe', url: '/archive', description: '', newTab: false },
        { label: 'Unsafe', url: 'javascript:alert(1)', description: '', newTab: false }
      ] }]
    }] })

    const publicHome = (await service.getPublicSiteConfig()).home
    const serialized = JSON.stringify(publicHome)

    expect(serialized).toContain('/archive')
    expect(serialized).not.toContain('javascript:')
    expect(serialized).not.toContain('internalSecret')
  })

  it('exposes analytics render config only when analytics is enabled', async () => {
    const { repository } = createFakeRepo()
    const service = createSettingsService({
      settingsRepository: repository,
      integrationRepository: {
        async list() {
          return [{
            capability: 'analytics', providerKey: 'plausible', enabled: true,
            publicConfigJson: JSON.stringify({ scriptUrl: 'https://plausible/js', siteId: 'blog.example', renderConfig: { 'data-domain': 'blog.example' } }),
            status: 'configured', lastCheckedAt: null, lastError: null, updatedAt: new Date()
          }]
        },
        async findByCapabilityAndProvider() { return null },
        async upsert() {},
        async upsertExclusive() {},
        async touch() {}
      },
      cache: createFakeCache().cache
    })
    const config = await service.getPublicSiteConfig()

    expect(config.analytics).toEqual({
      enabled: true,
      providerKey: 'plausible',
      scriptUrl: 'https://plausible/js',
      siteId: 'blog.example',
      renderConfig: {}
    })
  })

  it('projects only enabled public Turnstile and image integration fields', async () => {
    const { repository } = createFakeRepo()
    const rows = [
      {
        capability: 'commentProtection', providerKey: 'turnstile', enabled: true,
        publicConfigJson: JSON.stringify({ siteKey: 'public-site-key', ignored: 'secret' }),
        status: 'configured' as const, lastCheckedAt: null, lastError: null, updatedAt: new Date()
      },
      {
        capability: 'image', providerKey: 'url-template', enabled: true,
        publicConfigJson: JSON.stringify({ thumbnail: 'thumb/{url}', medium: 'medium/{url}', large: 'large/{url}' }),
        status: 'active' as const, lastCheckedAt: null, lastError: null, updatedAt: new Date()
      }
    ]
    const integrationRepository: IntegrationSettingsRepository = {
      async list() { return rows },
      async findByCapabilityAndProvider() { return null },
      async upsert() {},
      async upsertExclusive() {},
      async touch() {}
    }
    const service = createSettingsService({
      settingsRepository: repository,
      integrationRepository,
      cache: createFakeCache().cache
    })

    const config = await service.getPublicSiteConfig()

    expect(config.comment.protection).toEqual({ provider: 'turnstile', siteKey: 'public-site-key' })
    expect(config.image).toEqual({
      provider: 'url-template',
      templates: { thumbnail: 'thumb/{url}', medium: 'medium/{url}', large: 'large/{url}' }
    })
    expect(JSON.stringify(config)).not.toContain('ignored')
  })
})
