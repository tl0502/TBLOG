/**
 * Shared settings view types used by both the admin client and the server settings domain.
 * Pure type declarations only — runtime logic (defaults, guards, projections) stays in
 * `server/domain/settings.ts`.
 */

export const settingsDomains = ['site', 'home', 'profile', 'seo', 'comment', 'media', 'security', 'search'] as const

export type SettingsDomain = (typeof settingsDomains)[number]

export const siteLightThemeValues = ['default', 'atelier'] as const
export type SiteLightTheme = (typeof siteLightThemeValues)[number]

export interface NavigationItem {
  label: string
  href: string
}

export interface SocialLink {
  platform: string
  url: string
}

export interface SiteSettings {
  siteName: string
  description: string | null
  logoUrl: string | null
  featuredFallbackCover?: string | null
  lightTheme: SiteLightTheme
  navigation: NavigationItem[]
  locale: string
  timezone: string
  socialLinks: SocialLink[]
}

export const homeRailCardSizeValues = ['compact', 'normal', 'large'] as const
export type HomeRailCardSize = (typeof homeRailCardSizeValues)[number]

export interface HomeRailCardInstance { instanceId: string }

export interface HomeRailTagsCard extends HomeRailCardInstance {
  type: 'tags'
  enabled: boolean
  size: HomeRailCardSize
  title: string
  collapsedCount: number
}

export interface HomeRailBuildLogCard extends HomeRailCardInstance {
  type: 'build-log'
  enabled: boolean
  size: HomeRailCardSize
  title: string
  entries: string[]
}

export const homeContentMetricValues = ['articles', 'categories', 'tags', 'pageViews'] as const
export type HomeContentMetric = (typeof homeContentMetricValues)[number]

export interface HomeRailContentStatsCard extends HomeRailCardInstance {
  type: 'content-stats'
  enabled: boolean
  size: HomeRailCardSize
  title: string
  metrics: HomeContentMetric[]
}

export interface HomeRailSiteHistoryCard extends HomeRailCardInstance {
  type: 'site-history'
  enabled: boolean
  size: HomeRailCardSize
  title: string
  startDate: string | null
  showStartDate: boolean
  showLastUpdated: boolean
}

export interface HomeRailPublishingRhythmCard extends HomeRailCardInstance {
  type: 'publishing-rhythm'
  enabled: boolean
  size: HomeRailCardSize
  title: string
  weeks: number
  includeUpdates: boolean
}

export interface HomeFriendLink {
  label: string
  url: string
  description: string
  logoUrl: string | null
  newTab: boolean
}

export interface HomeRailFriendLinksCard extends HomeRailCardInstance {
  type: 'friend-links'
  enabled: boolean
  size: HomeRailCardSize
  title: string
  links: HomeFriendLink[]
}

export interface HomeNavigationLink {
  label: string
  url: string
  description: string
  newTab: boolean
}

export interface HomeNavigationGroup {
  label: string
  links: HomeNavigationLink[]
}

export interface HomeRailNavigationCard extends HomeRailCardInstance {
  type: 'navigation'
  enabled: boolean
  size: HomeRailCardSize
  title: string
  groups: HomeNavigationGroup[]
}

export interface HomeRailCuratedTopicCard extends HomeRailCardInstance {
  type: 'curated-topic'
  enabled: boolean
  size: HomeRailCardSize
  title: string
  eyebrow: string
  topicTitle: string
  summary: string
  coverUrl: string | null
  targetUrl: string
  articleSlugs: string[]
}

export type HomeSeriesStatus = 'ongoing' | 'complete'

export interface HomeSeriesChapter {
  title: string
  url: string
  published: boolean
}

export interface HomeRailReadingSeriesCard extends HomeRailCardInstance {
  type: 'reading-series'
  enabled: boolean
  size: HomeRailCardSize
  title: string
  seriesTitle: string
  status: HomeSeriesStatus
  chapters: HomeSeriesChapter[]
  showProgress: boolean
}

export interface HomeActivityEntry {
  date: string
  title: string
  detail: string
  url: string | null
}

export interface HomeRailSiteActivityCard extends HomeRailCardInstance {
  type: 'site-activity'
  enabled: boolean
  size: HomeRailCardSize
  title: string
  limit: number
  includePublished: boolean
  includeUpdated: boolean
  manualEntries: HomeActivityEntry[]
}

export type HomeRailCard =
  | HomeRailTagsCard
  | HomeRailBuildLogCard
  | HomeRailContentStatsCard
  | HomeRailSiteHistoryCard
  | HomeRailPublishingRhythmCard
  | HomeRailFriendLinksCard
  | HomeRailNavigationCard
  | HomeRailCuratedTopicCard
  | HomeRailReadingSeriesCard
  | HomeRailSiteActivityCard

/** Closed card library. Registration makes a type selectable; it does not add it to Home Settings. */
export const homeRailCardCatalogDefaults: HomeRailCard[] = [
  { instanceId: 'template-tags', type: 'tags', enabled: true, size: 'normal', title: 'Tags', collapsedCount: 12 },
  { instanceId: 'template-build-log', type: 'build-log', enabled: true, size: 'normal', title: 'Build Log', entries: ['Public read APIs and cache boundaries', 'Public frontend foundation'] },
  { instanceId: 'template-content-stats', type: 'content-stats', enabled: false, size: 'normal', title: '内容概览', metrics: ['articles', 'categories', 'tags', 'pageViews'] },
  { instanceId: 'template-site-history', type: 'site-history', enabled: false, size: 'normal', title: '站点历程', startDate: null, showStartDate: true, showLastUpdated: true },
  { instanceId: 'template-publishing-rhythm', type: 'publishing-rhythm', enabled: false, size: 'normal', title: '发布节奏', weeks: 8, includeUpdates: false },
  { instanceId: 'template-friend-links', type: 'friend-links', enabled: false, size: 'normal', title: '邻居们', links: [] },
  { instanceId: 'template-navigation', type: 'navigation', enabled: false, size: 'normal', title: '我的站点', groups: [] },
  { instanceId: 'template-curated-topic', type: 'curated-topic', enabled: false, size: 'normal', title: '专题策展', eyebrow: 'CURATED TOPIC', topicTitle: '', summary: '', coverUrl: null, targetUrl: '', articleSlugs: [] },
  { instanceId: 'template-reading-series', type: 'reading-series', enabled: false, size: 'normal', title: '系列阅读', seriesTitle: '', status: 'ongoing', chapters: [], showProgress: true },
  { instanceId: 'template-site-activity', type: 'site-activity', enabled: false, size: 'normal', title: '站点动态', limit: 6, includePublished: true, includeUpdated: true, manualEntries: [] }
]

export type PublicHomeRailCard = HomeRailCard extends infer Card
  ? Card extends HomeRailCuratedTopicCard
    ? Omit<Card, 'enabled' | 'articleSlugs'>
    : Card extends { enabled: boolean }
      ? Omit<Card, 'enabled'>
      : never
  : never

export interface HomeSettings {
  railCards: HomeRailCard[]
}

export interface PublicHomeSettings {
  railCards: PublicHomeRailCard[]
}

export interface ProfileSocialLink {
  platform: string
  url: string
  visible: boolean
  sortOrder: number
}

export interface ProfileProject {
  name: string
  description: string
  status: string
  tags: string[]
  url: string | null
  visible: boolean
  sortOrder: number
}

export interface ProfileJourneyEntry {
  period: string
  title: string
  role: string
  description: string
  visible: boolean
  sortOrder: number
}

/** Administrator-editable public profile configuration. */
export interface ProfileSettings {
  name: string
  role: string
  avatarUrl: string | null
  shortBio: string
  signature: string
  introduction: string
  topics: string[]
  currentStatus: string
  location: string | null
  socialLinks: ProfileSocialLink[]
  projects: ProfileProject[]
  journeyEnabled: boolean
  journey: ProfileJourneyEntry[]
}

export interface PublicProfileSocialLink {
  platform: string
  url: string
}

export interface PublicProfileProject {
  name: string
  description: string
  status: string
  tags: string[]
  url: string | null
}

export interface PublicProfileJourneyEntry {
  period: string
  title: string
  role: string
  description: string
}

/** Public projection with visibility and ordering controls removed. */
export interface PublicProfile {
  name: string
  role: string
  avatarUrl: string | null
  shortBio: string
  signature: string
  introduction: string
  topics: string[]
  currentStatus: string
  location: string | null
  socialLinks: PublicProfileSocialLink[]
  projects: PublicProfileProject[]
  journeyEnabled: boolean
  journey: PublicProfileJourneyEntry[]
}

export interface SeoSettings {
  defaultTitle: string | null
  defaultDescription: string | null
  canonicalBaseUrl: string | null
  rssEnabled: boolean
  sitemapEnabled: boolean
  robotsPolicy: string
}

export interface AnalyticsSettings {
  enabled: boolean
  providerKey: string | null
  scriptUrl: string | null
  siteId: string | null
  renderConfig: Record<string, unknown>
}

export interface CommentRateLimitConfig {
  windowSeconds: number | null
  maxPerWindow: number | null
}

export interface CommentSettings {
  enabled: boolean
  autoModerationEnabled: boolean
  turnstileSiteKey: string | null
  rateLimit: CommentRateLimitConfig
}

export interface MediaSettings {
  externalUrlMode: boolean
  imageProviderKey: string | null
  urlTemplates: Record<string, string>
  storageProviderStatus: string | null
}

export interface SecuritySettings {
  sessionTtlSeconds: number
  setupLocked: boolean
  allowedOrigins: string[]
}

export interface SearchSettings {
  enabled: boolean
  providerKey: string | null
  publicConfig: Record<string, unknown>
  indexingStatus: string | null
  lastIndexedAt: number | null
  lastError: string | null
}

export interface SettingsByDomain {
  site: SiteSettings
  home: HomeSettings
  profile: ProfileSettings
  seo: SeoSettings
  comment: CommentSettings
  media: MediaSettings
  security: SecuritySettings
  search: SearchSettings
}

export type DomainSettings<TDomain extends SettingsDomain> = SettingsByDomain[TDomain]
