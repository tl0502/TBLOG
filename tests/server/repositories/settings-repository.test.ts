import { createSettingsRepository } from '../../../server/repositories/settings-repository'
import { settingsDefaults } from '../../../server/domain/settings'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

function setup() {
  const { db, sqlite } = createSqliteTestDatabase()
  return { repository: createSettingsRepository(db as never), sqlite }
}

describe('settings repository', () => {
  it('returns domain defaults when a domain has never been persisted', async () => {
    const { repository } = setup()

    expect(await repository.getDomain('site')).toEqual(settingsDefaults.site)
    expect(await repository.getDomain('home')).toEqual(settingsDefaults.home)
    expect(await repository.getDomain('profile')).toEqual(settingsDefaults.profile)
    expect(await repository.getDomain('seo')).toEqual(settingsDefaults.seo)
    expect(await repository.getDomain('comment')).toEqual(settingsDefaults.comment)
    expect(await repository.getDomain('media')).toEqual(settingsDefaults.media)
    expect(await repository.getDomain('security')).toEqual(settingsDefaults.security)
    expect(await repository.getDomain('search')).toEqual(settingsDefaults.search)
  })

  it('round-trips structured profile lists and optional journey content', async () => {
    const { repository, sqlite } = setup()
    const profile = {
      ...settingsDefaults.profile,
      name: 'Author',
      socialLinks: [
        { platform: 'github', url: 'https://github.com/author', visible: true, sortOrder: 1 }
      ],
      projects: [
        {
          name: 'TBLOG',
          description: 'A durable publishing system',
          status: 'Active',
          tags: ['Nuxt', 'D1'],
          url: '/',
          visible: true,
          sortOrder: 2
        }
      ],
      journeyEnabled: true,
      journey: [
        {
          period: '2025 — NOW',
          title: 'TBLOG',
          role: 'Independent builder',
          description: 'Building the publishing workflow.',
          visible: true,
          sortOrder: 3
        }
      ]
    }

    await repository.saveDomain('profile', profile)

    expect(await repository.getDomain('profile')).toEqual(profile)
    expect(sqlite.prepare('SELECT count(*) AS n FROM profile_settings').get()).toEqual({ n: 1 })
  })

  it('uses the profile revision to reject stale writes atomically', async () => {
    const { repository } = setup()
    expect(await repository.getProfileSnapshot()).toEqual({
      value: settingsDefaults.profile,
      revision: null
    })

    const firstRevision = await repository.saveProfileIfRevision(
      { ...settingsDefaults.profile, name: 'First' },
      null
    )
    expect(firstRevision).not.toBeNull()

    await expect(repository.saveProfileIfRevision(
      { ...settingsDefaults.profile, name: 'Stale' },
      null
    )).resolves.toBeNull()
    expect((await repository.getDomain('profile')).name).toBe('First')

    const secondRevision = await repository.saveProfileIfRevision(
      { ...settingsDefaults.profile, name: 'Second' },
      firstRevision
    )
    expect(secondRevision).toBeGreaterThan(firstRevision!)
    expect((await repository.getProfileSnapshot()).value.name).toBe('Second')
  })

  it('round-trips the ordered home rail card configuration', async () => {
    const { repository, sqlite } = setup()
    const home = {
      railCards: [
        { instanceId: 'build-1', type: 'build-log' as const, enabled: true, size: 'large' as const, title: 'Shipping', entries: ['One'] },
        { instanceId: 'tags-1', type: 'tags' as const, enabled: false, size: 'compact' as const, title: 'Topics', collapsedCount: 6 }
      ]
    }

    await repository.saveDomain('home', home)

    expect(await repository.getDomain('home')).toEqual(home)
    expect(sqlite.prepare('SELECT count(*) AS n FROM home_settings').get()).toEqual({ n: 1 })
  })

  it('upserts the site domain and parses JSON columns back into structured fields', async () => {
    const { repository } = setup()

    await repository.saveDomain('site', {
      siteName: 'My Blog',
      description: 'hello',
      logoUrl: 'https://cdn/logo.png',
      faviconUrl: 'https://cdn/favicon.ico',
      featuredFallbackCover: null,
      lightTheme: 'atelier',
      navigation: [{ label: 'Home', href: '/' }],
      locale: 'en-US',
      timezone: 'UTC',
      socialLinks: [{ platform: 'github', url: 'https://github.com/x' }]
    })

    expect(await repository.getDomain('site')).toEqual({
      siteName: 'My Blog',
      description: 'hello',
      logoUrl: 'https://cdn/logo.png',
      faviconUrl: 'https://cdn/favicon.ico',
      featuredFallbackCover: null,
      lightTheme: 'atelier',
      navigation: [{ label: 'Home', href: '/' }],
      locale: 'en-US',
      timezone: 'UTC',
      socialLinks: [{ platform: 'github', url: 'https://github.com/x' }]
    })
  })

  it('keeps a single row across repeated writes (singleton upsert)', async () => {
    const { repository, sqlite } = setup()

    await repository.saveDomain('site', { ...settingsDefaults.site, siteName: 'First' })
    await repository.saveDomain('site', { ...settingsDefaults.site, siteName: 'Second' })

    const { n } = sqlite.prepare('SELECT count(*) AS n FROM site_settings').get() as { n: number }
    expect(n).toBe(1)
    expect((await repository.getDomain('site')).siteName).toBe('Second')
  })

  it('round-trips the search domain timestamp as epoch milliseconds', async () => {
    const { repository } = setup()

    await repository.saveDomain('search', {
      enabled: true,
      providerKey: 'algolia',
      publicConfig: { appId: 'abc', indexName: 'posts' },
      indexingStatus: 'idle',
      lastIndexedAt: 1_700_000_000_000,
      lastError: null
    })

    expect(await repository.getDomain('search')).toEqual({
      enabled: true,
      providerKey: 'algolia',
      publicConfig: { appId: 'abc', indexName: 'posts' },
      indexingStatus: 'idle',
      lastIndexedAt: 1_700_000_000_000,
      lastError: null
    })
  })

  it('round-trips comment rate limits', async () => {
    const { repository } = setup()

    await repository.saveDomain('comment', {
      enabled: true,
      autoModerationEnabled: true,
      turnstileSiteKey: 'ts-key',
      rateLimit: { windowSeconds: 60, maxPerWindow: 5 }
    })

    expect((await repository.getDomain('comment')).rateLimit).toEqual({ windowSeconds: 60, maxPerWindow: 5 })
    expect((await repository.getDomain('comment')).autoModerationEnabled).toBe(true)
  })
})
