import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import {
  commentSettings,
  homeSettings,
  mediaSettings,
  profileSettings,
  searchSettings,
  securitySettings,
  seoSettings,
  siteSettings
} from '../database/schema'
import {
  settingsDefaults,
  type HomeRailCard,
  type NavigationItem,
  type ProfileJourneyEntry,
  type ProfileProject,
  type ProfileSettings,
  type ProfileSocialLink,
  type SettingsByDomain,
  type SettingsDomain,
  type SocialLink
} from '../domain/settings'
import type { SettingsRepository } from './contracts/settings-repositories'

// Each domain table holds one row. A fixed singleton id keeps upserts deterministic (single
// `onConflictDoUpdate` statement) instead of read-then-write, which D1 cannot wrap in a transaction.
const SINGLETON_ID: Record<SettingsDomain, string> = {
  site: 'settings-site',
  home: 'settings-home',
  profile: 'settings-profile',
  seo: 'settings-seo',
  comment: 'settings-comment',
  media: 'settings-media',
  security: 'settings-security',
  search: 'settings-search'
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function parseHomeRailCards(raw: string | null): HomeRailCard[] {
  if (raw === null || raw === '') return settingsDefaults.home.railCards
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return settingsDefaults.home.railCards
    // Persisted settings may outlive their writer (or be edited directly in D1). Reject a
    // malformed whole payload so public projections never throw on a bad nested card shape.
    if (parsed.some((card) => !card || typeof card !== 'object' || typeof (card as { type?: unknown }).type !== 'string')) {
      return settingsDefaults.home.railCards
    }
    return parsed as HomeRailCard[]
  } catch {
    return settingsDefaults.home.railCards
  }
}

function toEpochMs(value: Date | number | null): number | null {
  if (value === null) return null
  return value instanceof Date ? value.getTime() : value
}

function profileColumns(value: ProfileSettings) {
  return {
    name: value.name,
    role: value.role,
    avatarUrl: value.avatarUrl,
    shortBio: value.shortBio,
    signature: value.signature,
    introduction: value.introduction,
    topicsJson: JSON.stringify(value.topics),
    currentStatus: value.currentStatus,
    location: value.location,
    socialLinksJson: JSON.stringify(value.socialLinks),
    projectsJson: JSON.stringify(value.projects),
    journeyEnabled: value.journeyEnabled,
    journeyJson: JSON.stringify(value.journey)
  }
}

export function createSettingsRepository(db: AppDatabase): SettingsRepository {
  async function getProfileSnapshot() {
    const [row] = await db
      .select()
      .from(profileSettings)
      .where(eq(profileSettings.id, SINGLETON_ID.profile))
      .limit(1)
    if (!row) return { value: settingsDefaults.profile, revision: null }
    return {
      value: {
        name: row.name,
        role: row.role,
        avatarUrl: row.avatarUrl,
        shortBio: row.shortBio,
        signature: row.signature,
        introduction: row.introduction,
        topics: parseJson<string[]>(row.topicsJson, settingsDefaults.profile.topics),
        currentStatus: row.currentStatus,
        location: row.location,
        socialLinks: parseJson<ProfileSocialLink[]>(row.socialLinksJson, settingsDefaults.profile.socialLinks),
        projects: parseJson<ProfileProject[]>(row.projectsJson, settingsDefaults.profile.projects),
        journeyEnabled: row.journeyEnabled,
        journey: parseJson<ProfileJourneyEntry[]>(row.journeyJson, settingsDefaults.profile.journey)
      },
      revision: toEpochMs(row.updatedAt)
    }
  }

  const readers: { [D in SettingsDomain]: () => Promise<SettingsByDomain[D]> } = {
    async site() {
      const [row] = await db.select().from(siteSettings).limit(1)
      if (!row) return settingsDefaults.site
      return {
        siteName: row.siteName,
        description: row.description,
        logoUrl: row.logoUrl,
        faviconUrl: row.faviconUrl ?? null,
        featuredFallbackCover: row.featuredFallbackCover ?? null,
        lightTheme: row.lightTheme,
        navigation: parseJson<NavigationItem[]>(row.navigationJson, []),
        locale: row.locale,
        timezone: row.timezone,
        socialLinks: parseJson<SocialLink[]>(row.socialLinksJson, [])
      }
    },
    async home() {
      const [row] = await db.select().from(homeSettings).limit(1)
      if (!row) return settingsDefaults.home
      return {
        railCards: parseHomeRailCards(row.railCardsJson)
      }
    },
    async profile() {
      return (await getProfileSnapshot()).value
    },
    async seo() {
      const [row] = await db.select().from(seoSettings).limit(1)
      if (!row) return settingsDefaults.seo
      return {
        defaultTitle: row.defaultTitle,
        defaultDescription: row.defaultDescription,
        canonicalBaseUrl: row.canonicalBaseUrl,
        rssEnabled: row.rssEnabled,
        sitemapEnabled: row.sitemapEnabled,
        robotsPolicy: row.robotsPolicy
      }
    },
    async comment() {
      const [row] = await db.select().from(commentSettings).limit(1)
      if (!row) return settingsDefaults.comment
      return {
        enabled: row.enabled,
        // New installs and migrated rows use the explicit opt-in column. The legacy
        // moderate_by_default flag remains for compatibility with older readers, but
        // must not silently opt existing sites into an external moderation provider.
        autoModerationEnabled: row.autoModerationEnabled,
        turnstileSiteKey: row.turnstileSiteKey,
        rateLimit: parseJson(row.rateLimitConfigJson, settingsDefaults.comment.rateLimit)
      }
    },
    async media() {
      const [row] = await db.select().from(mediaSettings).limit(1)
      if (!row) return settingsDefaults.media
      return {
        externalUrlMode: row.externalUrlMode,
        imageProviderKey: row.imageProviderKey,
        urlTemplates: parseJson<Record<string, string>>(row.urlTemplatesJson, {}),
        storageProviderStatus: row.storageProviderStatus
      }
    },
    async security() {
      const [row] = await db.select().from(securitySettings).limit(1)
      if (!row) return settingsDefaults.security
      return {
        sessionTtlSeconds: row.sessionTtlSeconds,
        setupLocked: row.setupLocked,
        allowedOrigins: parseJson<string[]>(row.allowedOriginsJson, [])
      }
    },
    async search() {
      const [row] = await db.select().from(searchSettings).limit(1)
      if (!row) return settingsDefaults.search
      return {
        enabled: row.enabled,
        providerKey: row.providerKey,
        publicConfig: parseJson<Record<string, unknown>>(row.publicConfigJson, {}),
        indexingStatus: row.indexingStatus,
        lastIndexedAt: toEpochMs(row.lastIndexedAt),
        lastError: row.lastError
      }
    }
  }

  const writers: {
    [D in SettingsDomain]: (value: SettingsByDomain[D]) => Promise<void>
  } = {
    async site(value) {
      const columns = {
        siteName: value.siteName,
        description: value.description,
        logoUrl: value.logoUrl,
        faviconUrl: value.faviconUrl,
        featuredFallbackCover: value.featuredFallbackCover,
        lightTheme: value.lightTheme,
        navigationJson: JSON.stringify(value.navigation),
        locale: value.locale,
        timezone: value.timezone,
        socialLinksJson: JSON.stringify(value.socialLinks)
      }
      await db
        .insert(siteSettings)
        .values({ id: SINGLETON_ID.site, ...columns })
        .onConflictDoUpdate({ target: siteSettings.id, set: { ...columns, updatedAt: new Date() } })
    },
    async home(value) {
      const columns = { railCardsJson: JSON.stringify(value.railCards) }
      await db
        .insert(homeSettings)
        .values({ id: SINGLETON_ID.home, ...columns })
        .onConflictDoUpdate({ target: homeSettings.id, set: { ...columns, updatedAt: new Date() } })
    },
    async profile(value) {
      const columns = profileColumns(value)
      await db
        .insert(profileSettings)
        .values({ id: SINGLETON_ID.profile, ...columns })
        .onConflictDoUpdate({ target: profileSettings.id, set: { ...columns, updatedAt: new Date() } })
    },
    async seo(value) {
      const columns = {
        defaultTitle: value.defaultTitle,
        defaultDescription: value.defaultDescription,
        canonicalBaseUrl: value.canonicalBaseUrl,
        rssEnabled: value.rssEnabled,
        sitemapEnabled: value.sitemapEnabled,
        robotsPolicy: value.robotsPolicy
      }
      await db
        .insert(seoSettings)
        .values({ id: SINGLETON_ID.seo, ...columns })
        .onConflictDoUpdate({ target: seoSettings.id, set: { ...columns, updatedAt: new Date() } })
    },
    async comment(value) {
      const columns = {
        enabled: value.enabled,
        moderateByDefault: !value.autoModerationEnabled,
        autoModerationEnabled: value.autoModerationEnabled,
        turnstileSiteKey: value.turnstileSiteKey,
        rateLimitConfigJson: JSON.stringify(value.rateLimit)
      }
      await db
        .insert(commentSettings)
        .values({ id: SINGLETON_ID.comment, ...columns })
        .onConflictDoUpdate({ target: commentSettings.id, set: { ...columns, updatedAt: new Date() } })
    },
    async media(value) {
      const columns = {
        externalUrlMode: value.externalUrlMode,
        imageProviderKey: value.imageProviderKey,
        urlTemplatesJson: JSON.stringify(value.urlTemplates),
        storageProviderStatus: value.storageProviderStatus
      }
      await db
        .insert(mediaSettings)
        .values({ id: SINGLETON_ID.media, ...columns })
        .onConflictDoUpdate({ target: mediaSettings.id, set: { ...columns, updatedAt: new Date() } })
    },
    async security(value) {
      const columns = {
        sessionTtlSeconds: value.sessionTtlSeconds,
        setupLocked: value.setupLocked,
        allowedOriginsJson: JSON.stringify(value.allowedOrigins)
      }
      await db
        .insert(securitySettings)
        .values({ id: SINGLETON_ID.security, ...columns })
        .onConflictDoUpdate({ target: securitySettings.id, set: { ...columns, updatedAt: new Date() } })
    },
    async search(value) {
      const columns = {
        enabled: value.enabled,
        providerKey: value.providerKey,
        publicConfigJson: JSON.stringify(value.publicConfig),
        indexingStatus: value.indexingStatus,
        lastIndexedAt: value.lastIndexedAt === null ? null : new Date(value.lastIndexedAt),
        lastError: value.lastError
      }
      await db
        .insert(searchSettings)
        .values({ id: SINGLETON_ID.search, ...columns })
        .onConflictDoUpdate({ target: searchSettings.id, set: { ...columns, updatedAt: new Date() } })
    }
  }

  return {
    getDomain<TDomain extends SettingsDomain>(domain: TDomain) {
      return readers[domain]() as Promise<SettingsByDomain[TDomain]>
    },
    getProfileSnapshot,
    saveDomain<TDomain extends SettingsDomain>(domain: TDomain, value: SettingsByDomain[TDomain]) {
      return (writers[domain] as (v: SettingsByDomain[TDomain]) => Promise<void>)(value)
    },
    async saveProfileIfRevision(value, expectedRevision) {
      const nextRevision = new Date(Math.max(Date.now(), (expectedRevision ?? 0) + 1))
      const columns = profileColumns(value)
      if (expectedRevision === null) {
        const rows = await db
          .insert(profileSettings)
          .values({ id: SINGLETON_ID.profile, ...columns, updatedAt: nextRevision })
          .onConflictDoNothing()
          .returning({ updatedAt: profileSettings.updatedAt })
        return rows[0] ? toEpochMs(rows[0].updatedAt) : null
      }

      const rows = await db
        .update(profileSettings)
        .set({ ...columns, updatedAt: nextRevision })
        .where(and(
          eq(profileSettings.id, SINGLETON_ID.profile),
          eq(profileSettings.updatedAt, new Date(expectedRevision))
        ))
        .returning({ updatedAt: profileSettings.updatedAt })
      return rows[0] ? toEpochMs(rows[0].updatedAt) : null
    }
  }
}
