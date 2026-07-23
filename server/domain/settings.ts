/**
 * Domain configuration split by domain (architecture.md "Configuration"). Each domain maps to a
 * single-row settings table. JSON columns (navigation, social links, render config, etc.) are
 * parsed into structured fields here so services and controllers never touch raw JSON strings.
 *
 * Secrets never live in these tables — only public or non-secret configuration.
 *
 * The per-domain shapes are shared with the admin client and live in `types/settings.ts`.
 */

import {
  homeRailCardCatalogDefaults,
  settingsDomains,
  type HomeRailCard,
  type PublicHomeRailCard,
  type SettingsByDomain,
  type SettingsDomain
} from '../../types/settings'
import { isAbsoluteHttpUrl, isPublicCardUrl } from '../../utils/public-url'

export { settingsDomains }
export type {
  AnalyticsSettings,
  CommentRateLimitConfig,
  CommentSettings,
  DomainSettings,
  HomeRailCard,
  HomeRailCardSize,
  HomeSettings,
  MediaSettings,
  NavigationItem,
  ProfileJourneyEntry,
  ProfileProject,
  ProfileSettings,
  ProfileSocialLink,
  PublicProfile,
  PublicHomeRailCard,
  PublicHomeSettings,
  SearchSettings,
  SecuritySettings,
  SeoSettings,
  SiteLightTheme,
  SettingsByDomain,
  SettingsDomain,
  SiteSettings,
  SocialLink
} from '../../types/settings'
import type {
  AnalyticsSettings,
  CommentSettings,
  HomeSettings,
  NavigationItem,
  ProfileSettings,
  PublicHomeSettings,
  PublicProfile,
  SeoSettings,
  SiteLightTheme,
  SiteSettings,
  SocialLink
} from '../../types/settings'

export function isSettingsDomain(value: unknown): value is SettingsDomain {
  return typeof value === 'string' && (settingsDomains as readonly string[]).includes(value)
}

export const DEFAULT_SESSION_TTL_SECONDS = 604_800

export const homeRailCardDefaults = homeRailCardCatalogDefaults

function cloneHomeRailCard(card: HomeRailCard): HomeRailCard {
  if (card.type === 'build-log') return { ...card, entries: [...card.entries] }
  if (card.type === 'content-stats') return { ...card, metrics: [...card.metrics] }
  if (card.type === 'friend-links') return { ...card, links: card.links.map((link) => ({ ...link })) }
  if (card.type === 'navigation') {
    return { ...card, groups: card.groups.map((group) => ({ ...group, links: group.links.map((link) => ({ ...link })) })) }
  }
  if (card.type === 'curated-topic') return { ...card, articleSlugs: [...card.articleSlugs] }
  if (card.type === 'reading-series') return { ...card, chapters: card.chapters.map((chapter) => ({ ...chapter })) }
  if (card.type === 'site-activity') return { ...card, manualEntries: card.manualEntries.map((entry) => ({ ...entry })) }
  return { ...card }
}

export function normalizeHomeSettings(input: HomeSettings): HomeSettings {
  const known = new Set(homeRailCardDefaults.map((card) => card.type))
  const instanceIds = new Set<string>()
  const cards = (Array.isArray(input?.railCards) ? input.railCards : [])
    .filter((card): card is HomeRailCard => {
      return Boolean(card && typeof card === 'object' && known.has(card.type))
    })
    .flatMap((card, index) => {
      try {
        const cloned = cloneHomeRailCard(card)
        const rawId = typeof cloned.instanceId === 'string' ? cloned.instanceId.trim() : ''
        const requested = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(rawId)
          && !['__proto__', 'prototype', 'constructor'].includes(rawId)
          ? rawId
          : `${cloned.type}-${index + 1}`
        let instanceId = requested
        let suffix = 2
        while (instanceIds.has(instanceId)) instanceId = `${requested}-${suffix++}`
        instanceIds.add(instanceId)
        return [{ ...cloned, instanceId } as HomeRailCard]
      } catch { return [] }
    })
  return { railCards: cards }
}

function toPublicHomeRailCard(card: HomeRailCard): PublicHomeRailCard {
  const base = { instanceId: card.instanceId, type: card.type, size: card.size, title: card.title }
  if (card.type === 'tags') return { ...base, type: card.type, collapsedCount: card.collapsedCount }
  if (card.type === 'build-log') return { ...base, type: card.type, entries: card.entries.filter((entry) => typeof entry === 'string') }
  if (card.type === 'content-stats') return { ...base, type: card.type, metrics: [...card.metrics] }
  if (card.type === 'site-history') return {
    ...base, type: card.type, startDate: card.startDate,
    showStartDate: card.showStartDate, showLastUpdated: card.showLastUpdated
  }
  if (card.type === 'publishing-rhythm') return {
    ...base, type: card.type, weeks: card.weeks, includeUpdates: card.includeUpdates
  }
  if (card.type === 'friend-links') return {
    ...base, type: card.type,
    links: card.links.filter((link) => isAbsoluteHttpUrl(link.url)).map((link) => ({
      label: link.label, url: link.url, description: link.description,
      logoUrl: link.logoUrl && isAbsoluteHttpUrl(link.logoUrl) ? link.logoUrl : null, newTab: link.newTab
    }))
  }
  if (card.type === 'navigation') return {
    ...base, type: card.type,
    groups: card.groups.map((group) => ({
      label: group.label,
      links: group.links.filter((link) => isPublicCardUrl(link.url)).map((link) => ({
        label: link.label, url: link.url, description: link.description, newTab: link.newTab
      }))
    })).filter((group) => group.links.length > 0)
  }
  if (card.type === 'curated-topic') return {
    ...base, type: card.type, eyebrow: card.eyebrow, topicTitle: card.topicTitle, summary: card.summary,
    coverUrl: card.coverUrl && isAbsoluteHttpUrl(card.coverUrl) ? card.coverUrl : null,
    targetUrl: card.targetUrl && isPublicCardUrl(card.targetUrl) ? card.targetUrl : ''
  }
  if (card.type === 'reading-series') return {
    ...base, type: card.type, seriesTitle: card.seriesTitle, status: card.status, showProgress: card.showProgress,
    chapters: card.chapters.filter((chapter) => chapter.published && isPublicCardUrl(chapter.url)).map((chapter) => ({ ...chapter }))
  }
  return {
    ...base, type: card.type, limit: card.limit,
    includePublished: card.includePublished, includeUpdated: card.includeUpdated,
    manualEntries: card.manualEntries.filter((entry) => !entry.url || isPublicCardUrl(entry.url)).map((entry) => ({ ...entry }))
  }
}

/** Domain defaults returned when a domain has never been persisted. */
export const settingsDefaults: SettingsByDomain = {
  site: {
    siteName: 'TBLOG',
    description: null,
    logoUrl: null,
    faviconUrl: null,
    featuredFallbackCover: null,
    lightTheme: 'default',
    navigation: [],
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    socialLinks: []
  },
  home: normalizeHomeSettings({ railCards: homeRailCardDefaults.slice(0, 2).map((card) => ({
    ...card,
    instanceId: card.type === 'tags' ? 'default-tags' : 'default-build-log'
  })) as HomeRailCard[] }),
  profile: {
    name: 'Tian',
    role: 'Independent builder · Writer',
    avatarUrl: null,
    shortBio: '在构建、写作与反复推敲中，记录技术系统背后更长久的思考。',
    signature: '我喜欢把复杂系统整理成能够被理解、使用和长期维护的作品。',
    introduction:
      '目前主要关注 Cloudflare 生态、内容管理系统与独立产品。我在这里记录实现过程，也记录架构决策背后的取舍。相比快速追逐新事物，我更在意一个想法如何逐渐形成自己的结构。',
    topics: ['Cloudflare', 'Content Systems', 'Independent Products'],
    currentStatus: '正在构建 TBLOG',
    location: 'Asia / Shanghai',
    socialLinks: [],
    projects: [],
    journeyEnabled: false,
    journey: []
  },
  seo: {
    defaultTitle: null,
    defaultDescription: null,
    canonicalBaseUrl: null,
    rssEnabled: true,
    sitemapEnabled: true,
    robotsPolicy: 'index,follow'
  },
  comment: {
    enabled: true,
    autoModerationEnabled: false,
    turnstileSiteKey: null,
    rateLimit: { windowSeconds: null, maxPerWindow: null }
  },
  media: {
    externalUrlMode: true,
    imageProviderKey: null,
    urlTemplates: {},
    storageProviderStatus: null
  },
  security: {
    sessionTtlSeconds: DEFAULT_SESSION_TTL_SECONDS,
    setupLocked: false,
    allowedOrigins: []
  },
  search: {
    enabled: false,
    providerKey: null,
    publicConfig: {},
    indexingStatus: null,
    lastIndexedAt: null,
    lastError: null
  }
}

/** Public projection of the site configuration exposed by `GET /api/v1/site-config`. */
export interface PublicSiteConfig {
  site: {
    siteName: string
    description: string | null
    logoUrl: string | null
    faviconUrl: string | null
    featuredFallbackCover: string | null
    lightTheme: SiteLightTheme
    navigation: NavigationItem[]
    socialLinks: SocialLink[]
    locale: string
  }
  profile: PublicProfile
  home: PublicHomeSettings
  seo: {
    defaultTitle: string | null
    defaultDescription: string | null
    canonicalBaseUrl: string | null
    robotsPolicy: string
    rssEnabled: boolean
    sitemapEnabled: boolean
  }
  analytics:
    | { enabled: false }
    | {
        enabled: true
        providerKey: string | null
        scriptUrl: string | null
        siteId: string | null
        renderConfig: Record<string, unknown>
      }
  comment: {
    enabled: boolean
    protection:
      | {
          provider: string
          siteKey: string
        }
      | null
  }
  image:
    | {
        provider: string
        templates: {
          thumbnail: string | null
          medium: string | null
          large: string | null
        }
      }
    | null
}

/**
 * Build the public site-config projection. Only whitelisted public fields are emitted; secrets and
 * internal state (indexing status, allowed origins, session policy, etc.) are never included.
 */
export function toPublicSiteConfig(input: {
  site: SiteSettings
  home: HomeSettings
  profile: ProfileSettings
  seo: SeoSettings
  analytics: AnalyticsSettings
  comment: CommentSettings
  commentProtection?: { provider: string; siteKey: string } | null
  image?: {
    provider: string
    templates: { thumbnail: string | null; medium: string | null; large: string | null }
  } | null
}): PublicSiteConfig {
  const fallbackCover = input.site.featuredFallbackCover
  const safeFallbackCover = fallbackCover && /^https?:\/\//i.test(fallbackCover) ? fallbackCover : null
  const rawFavicon = input.site.faviconUrl?.trim() || null
  const safeFavicon = rawFavicon && (
    /^https?:\/\//i.test(rawFavicon) || (rawFavicon.startsWith('/') && !rawFavicon.startsWith('//'))
  )
    ? rawFavicon
    : null
  const profile = toPublicProfile(input.profile)
  return {
    site: {
      siteName: input.site.siteName,
      description: input.site.description,
      logoUrl: input.site.logoUrl,
      faviconUrl: safeFavicon,
      featuredFallbackCover: safeFallbackCover,
      lightTheme: input.site.lightTheme,
      navigation: input.site.navigation,
      socialLinks: input.site.socialLinks,
      locale: input.site.locale
    },
    profile,
    home: {
      railCards: normalizeHomeSettings(input.home).railCards
        .filter((card) => card.enabled)
        .map(toPublicHomeRailCard)
    },
    seo: {
      defaultTitle: input.seo.defaultTitle?.trim() || null,
      defaultDescription: input.seo.defaultDescription?.trim() || null,
      canonicalBaseUrl: input.seo.canonicalBaseUrl,
      robotsPolicy: input.seo.robotsPolicy,
      rssEnabled: input.seo.rssEnabled,
      sitemapEnabled: input.seo.sitemapEnabled
    },
    analytics: input.analytics.enabled
      ? {
          enabled: true,
          providerKey: input.analytics.providerKey,
          scriptUrl: input.analytics.scriptUrl,
          siteId: input.analytics.siteId,
          renderConfig: input.analytics.renderConfig
        }
      : { enabled: false },
    comment: {
      enabled: input.comment.enabled,
      protection: input.commentProtection ?? null
    },
    image: input.image ?? null
  }
}

/** Strip admin visibility/order controls before returning profile data to public clients. */
export function toPublicProfile(input: ProfileSettings): PublicProfile {
  const visibleSocialLinks = input.socialLinks
    .slice()
    .filter((link) => link.visible)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ platform, url }) => ({ platform, url }))
  const visibleProjects = input.projects
    .slice()
    .filter((project) => project.visible)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ name, description, status, tags, url }) => ({ name, description, status, tags, url }))
  const journey = input.journeyEnabled
    ? input.journey
        .slice()
        .filter((entry) => entry.visible)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(({ period, title, role, description }) => ({ period, title, role, description }))
    : []

  return {
    name: input.name,
    role: input.role,
    avatarUrl: input.avatarUrl,
    shortBio: input.shortBio,
    signature: input.signature,
    introduction: input.introduction,
    topics: [...input.topics],
    currentStatus: input.currentStatus,
    location: input.location,
    socialLinks: visibleSocialLinks,
    projects: visibleProjects,
    journeyEnabled: input.journeyEnabled && journey.length > 0,
    journey
  }
}
