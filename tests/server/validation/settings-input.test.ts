import { describe, expect, it } from 'vitest'
import {
  MAX_D1_SETTINGS_JSON_BYTES,
  homeSettingsInputSchema,
  mediaSettingsInputSchema,
  profileSettingsInputSchema,
  searchSettingsInputSchema,
  seoSettingsInputSchema,
  siteSettingsInputSchema
} from '../../../server/validation/settings-input'

describe('settings URL input validation', () => {
  it('validates registered home rail cards, allows duplicate types, and rejects duplicate instance ids', () => {
    const parsed = homeSettingsInputSchema.parse({
      railCards: [
        { type: 'build-log', title: 'Now', entries: ['One'] },
        { type: 'tags', collapsedCount: 8 }
      ]
    })

    expect(parsed.railCards.map((card) => card.type)).toEqual(['build-log', 'tags'])
    expect(parsed.railCards[0]).toMatchObject({ enabled: true, size: 'normal' })
    expect(homeSettingsInputSchema.parse({
      railCards: [{ type: 'tags' }, { type: 'tags' }]
    }).railCards).toHaveLength(2)
    expect(() => homeSettingsInputSchema.parse({
      railCards: [{ instanceId: 'same', type: 'tags' }, { instanceId: 'same', type: 'tags' }]
    })).toThrow()
    expect(() => homeSettingsInputSchema.parse({ railCards: [{ instanceId: '__proto__', type: 'tags' }] })).toThrow()
    expect(() => homeSettingsInputSchema.parse({
      railCards: [{ type: 'remote-component' }]
    })).toThrow()
  })

  it('accepts external navigation websites and rejects executable card URLs', () => {
    const parsed = homeSettingsInputSchema.parse({ railCards: [{
      type: 'navigation', enabled: true, size: 'normal', title: 'My sites', groups: [{
        label: 'Elsewhere',
        links: [{ label: 'Studio', url: 'https://studio.example.com', description: '', newTab: true }]
      }]
    }] })
    expect(parsed.railCards[0]).toMatchObject({ type: 'navigation', groups: [{ label: 'Elsewhere' }] })
    expect(() => homeSettingsInputSchema.parse({ railCards: [{
      type: 'navigation', enabled: true, size: 'normal', title: 'Bad', groups: [{
        label: 'Bad', links: [{ label: 'Run', url: 'javascript:alert(1)', description: '', newTab: false }]
      }]
    }] })).toThrow()
    expect(() => homeSettingsInputSchema.parse({ railCards: [{
      type: 'navigation', enabled: true, size: 'normal', title: 'Bad', groups: [{
        label: 'Bad', links: [{ label: 'Escape', url: '/\\evil.example', description: '', newTab: false }]
      }]
    }] })).toThrow()
  })

  it('validates every approved dynamic home card configuration', () => {
    const parsed = homeSettingsInputSchema.parse({ railCards: [
      { type: 'content-stats', enabled: true, size: 'normal', title: 'Stats', metrics: ['articles', 'pageViews'] },
      { type: 'site-history', enabled: true, size: 'normal', title: 'History', startDate: '2024-01-01', showStartDate: true, showLastUpdated: true },
      { type: 'publishing-rhythm', enabled: true, size: 'normal', title: 'Rhythm', weeks: 8, includeUpdates: true },
      { type: 'site-activity', enabled: true, size: 'normal', title: 'Activity', limit: 5, includePublished: true, includeUpdated: true, manualEntries: [] }
    ] })
    expect(parsed.railCards).toHaveLength(4)
  })

  it('keeps D1-backed settings JSON within a safe UTF-8 byte budget', () => {
    const navigationCard = (index: number) => ({
      type: 'navigation' as const,
      instanceId: `navigation-${index}`,
      title: 'n'.repeat(80),
      groups: Array.from({ length: 10 }, () => ({
        label: 'g'.repeat(80),
        links: Array.from({ length: 20 }, () => ({
          label: 'l'.repeat(80),
          url: `https://example.com/${'u'.repeat(2028)}`,
          description: 'd'.repeat(160)
        }))
      }))
    })
    expect(() => homeSettingsInputSchema.parse({
      railCards: Array.from({ length: 4 }, (_, index) => navigationCard(index))
    })).toThrow()

    const urlTemplates = Object.fromEntries(Array.from({ length: 800 }, (_, index) => [
      `template-${index}`,
      'u'.repeat(2048)
    ]))
    expect(() => mediaSettingsInputSchema.parse({ urlTemplates })).toThrow()
    expect(() => searchSettingsInputSchema.parse({
      publicConfig: { payload: '界'.repeat(Math.ceil(MAX_D1_SETTINGS_JSON_BYTES / 3) + 1) }
    })).toThrow()
  })

  it('accepts only administrator-selectable light themes and defaults to the existing theme', () => {
    expect(siteSettingsInputSchema.parse({ siteName: 'TBLOG' }).lightTheme).toBe('default')
    expect(siteSettingsInputSchema.parse({ siteName: 'TBLOG', lightTheme: 'atelier' }).lightTheme)
      .toBe('atelier')
    expect(() => siteSettingsInputSchema.parse({ siteName: 'TBLOG', lightTheme: 'nocturne' }))
      .toThrow()
    expect(() => siteSettingsInputSchema.parse({ siteName: 'TBLOG', lightTheme: 'system' }))
      .toThrow()
  })

  it('accepts absolute or root-relative favicon URLs and rejects unsafe values', () => {
    expect(siteSettingsInputSchema.parse({ siteName: 'TBLOG' }).faviconUrl).toBeNull()
    expect(siteSettingsInputSchema.parse({ siteName: 'TBLOG', faviconUrl: 'https://cdn.example/icon.png' }).faviconUrl)
      .toBe('https://cdn.example/icon.png')
    expect(siteSettingsInputSchema.parse({ siteName: 'TBLOG', faviconUrl: '/favicon.ico' }).faviconUrl)
      .toBe('/favicon.ico')
    expect(siteSettingsInputSchema.parse({ siteName: 'TBLOG', faviconUrl: '   ' }).faviconUrl).toBeNull()
    expect(() => siteSettingsInputSchema.parse({ siteName: 'TBLOG', faviconUrl: 'javascript:alert(1)' })).toThrow()
    expect(() => siteSettingsInputSchema.parse({ siteName: 'TBLOG', faviconUrl: '//evil.example/x.ico' })).toThrow()
  })

  it('accepts only the safe robots policy presets', () => {
    expect(seoSettingsInputSchema.parse({ robotsPolicy: 'noindex,nofollow' }).robotsPolicy)
      .toBe('noindex,nofollow')
    expect(() => seoSettingsInputSchema.parse({ robotsPolicy: 'index, follow, max-snippet:-1' }))
      .toThrow()
  })

  it.each(['https://blog.example', 'http://localhost:3000/blog', '  https://blog.example/  '])(
    'accepts an absolute HTTP(S) canonical URL: %s',
    (canonicalBaseUrl) => {
      const parsed = seoSettingsInputSchema.parse({ canonicalBaseUrl })

      expect(parsed.canonicalBaseUrl).toBe(canonicalBaseUrl.trim())
    }
  )

  it.each([
    'blog.example',
    '/blog',
    'http:blog.example',
    'https:/blog.example',
    'ftp://blog.example',
    'javascript:alert(1)',
    'data:text/plain,blog'
  ])(
    'rejects an invalid canonical URL: %s',
    (canonicalBaseUrl) => {
      expect(() => seoSettingsInputSchema.parse({ canonicalBaseUrl })).toThrow()
    }
  )

  it('preserves nullable and optional URL semantics', () => {
    expect(seoSettingsInputSchema.parse({}).canonicalBaseUrl).toBeNull()
    expect(seoSettingsInputSchema.parse({ canonicalBaseUrl: null }).canonicalBaseUrl).toBeNull()
    expect(seoSettingsInputSchema.parse({ canonicalBaseUrl: '   ' }).canonicalBaseUrl).toBeNull()
  })

  it('rejects canonical base URLs with credentials, queries, or fragments', () => {
    for (const canonicalBaseUrl of [
      'https://user:pass@example.com',
      'https://example.com?campaign=summer',
      'https://example.com#top'
    ]) {
      expect(() => seoSettingsInputSchema.parse({ canonicalBaseUrl })).toThrow()
    }
  })

  it('normalizes blank SEO title and description values to null', () => {
    expect(seoSettingsInputSchema.parse({ defaultTitle: '  ', defaultDescription: '' }))
      .toMatchObject({ defaultTitle: null, defaultDescription: null })
  })

  it('validates profile list URLs and applies visibility/order defaults', () => {
    const parsed = profileSettingsInputSchema.parse({
      name: 'Tian',
      role: 'Writer',
      avatarUrl: null,
      shortBio: 'Short',
      signature: 'Signature',
      introduction: 'Introduction',
      currentStatus: 'Building',
      socialLinks: [{ platform: 'RSS', url: '/rss.xml' }],
      projects: [{ name: 'TBLOG', description: 'Project', status: 'Active' }]
    })

    expect(parsed.socialLinks[0]).toMatchObject({ visible: true, sortOrder: 0 })
    expect(parsed.projects[0]).toMatchObject({ visible: true, sortOrder: 0, tags: [], url: null })
    expect(parsed.journeyEnabled).toBe(false)
    expect(() => profileSettingsInputSchema.parse({
      name: 'Tian', role: 'Writer', shortBio: '', signature: '', introduction: '', currentStatus: '',
      socialLinks: [{ platform: 'x', url: 'javascript:alert(1)' }]
    })).toThrow()
  })
})
