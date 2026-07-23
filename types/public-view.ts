import type { PublicHomeSettings, PublicProfile, SiteLightTheme } from './settings'
import type { HomeFeedMeta } from './home-feed'
export type { PublicProfile } from './settings'

export interface TagView {
  slug: string
  name: string
}

export interface CategoryRefView {
  slug: string
  name: string
}

export interface ArticleListItemView {
  id: string
  slug: string
  title: string
  cover: string | null
  excerpt: string | null
  readingTime: number
  publishedAt: string
  category: CategoryRefView | null
  tags: TagView[]
}

export interface HotspotItemView {
  article: ArticleListItemView
  pageViews: number | null
  trend?: 'up' | 'steady' | 'down' | null
  fallback: boolean
}

export interface HotspotsView {
  current: HotspotItemView[]
  historical: HotspotItemView[]
}

export interface HomeRailContentStatsView {
  articles: number
  categories: number
  tags: number
  pageViews: number | null
}

export interface HomeRailSiteHistoryView {
  startDate: string | null
  daysRunning: number | null
  lastUpdatedAt: string | null
}

export interface HomeRailRhythmPointView {
  weekStart: string
  count: number
}

export interface HomeRailActivityEntryView {
  date: string
  title: string
  detail: string
  url: string | null
  source: 'published' | 'updated' | 'manual'
}

export interface HomeRailCardDataView {
  contentStats?: HomeRailContentStatsView | null
  siteHistory?: HomeRailSiteHistoryView | null
  publishingRhythm?: HomeRailRhythmPointView[]
  curatedTopicArticleCount?: number | null
  siteActivity?: HomeRailActivityEntryView[]
}

export interface HomeRailDataView {
  cards: Record<string, HomeRailCardDataView>
}

export interface HomeBootstrapView {
  feed: {
    items: ArticleListItemView[]
    meta: HomeFeedMeta
  }
  featured: ArticleListItemView[]
  hotspots: HotspotsView
  homeRail: HomeRailDataView
  tags: TaxonomyView[]
}

export interface TaxonomyView {
  slug: string
  name: string
  description: string | null
  color: string | null
  articleCount: number
}

export interface ArchiveGroupView {
  year: number
  month: number
  items: ArticleListItemView[]
}

export interface CodeBlockMetaView {
  index: number
  language: string | null
  filename: string | null
  highlightedLines: number[]
  collapsed: boolean
  diff: boolean
}

export interface TocItemView {
  id: string
  depth: 2 | 3
  text: string
}

export interface PublicCommentView {
  id: string
  nickname: string
  content: string
  createdAt: string
  replies?: PublicCommentReplyView[]
}

export interface PublicCommentReplyView {
  id: string
  parentCommentId: string
  replyToNickname: string | null
  nickname: string
  content: string
  createdAt: string
}

export interface PostDetailView extends ArticleListItemView {
  type: 'article' | 'page'
  /** ISO timestamp of last content/metadata change; falls back to publishedAt when absent. */
  updatedAt?: string | null
  html: string
  tocJson: string | null
  codeMeta: CodeBlockMetaView[]
  cover: string | null
  seoTitle: string | null
  seoDescription: string | null
  canonicalUrlOverride: string | null
  openGraphImageUrl: string | null
  twitterImageUrl: string | null
  jsonLdOverrideJson: string | null
  pageViews?: number | null
  analyticsUpdatedAt?: string | null
}

/** Client view of `GET /api/v1/site-config` (mirrors the server `PublicSiteConfig` projection). */
export interface PublicSiteConfigView {
  site: {
    siteName: string
    description: string | null
    logoUrl: string | null
    faviconUrl: string | null
    featuredFallbackCover: string | null
    lightTheme: SiteLightTheme
    navigation: { label: string; href: string }[]
    socialLinks: { platform: string; url: string }[]
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
    protection: { provider: string; siteKey: string } | null
  }
  image: {
    provider: string
    templates: {
      thumbnail: string | null
      medium: string | null
      large: string | null
    }
  } | null
}


export type PublicAnalyticsConfig = PublicSiteConfigView['analytics']
