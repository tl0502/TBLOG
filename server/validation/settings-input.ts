import { z } from 'zod'
import type { SettingsByDomain, SettingsDomain } from '../domain/settings'
import { DEFAULT_SESSION_TTL_SECONDS } from '../domain/settings'
import { homeContentMetricValues, homeRailCardSizeValues, siteLightThemeValues } from '../../types/settings'
import { isSafeRootRelativeUrl } from '../../utils/public-url'

export const MAX_D1_SETTINGS_JSON_BYTES = 1_500_000

function fitsD1SettingsJson(value: unknown): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_D1_SETTINGS_JSON_BYTES
  } catch {
    return false
  }
}

const d1SettingsJsonLimit = {
  message: `Settings JSON must not exceed ${MAX_D1_SETTINGS_JSON_BYTES} UTF-8 bytes`
} as const

const nullableText = (max: number) => z.string().trim().max(max).nullable()
const urlText = (max = 2048) => z.string().trim().max(max)
const absoluteHttpUrlText = (max = 2048) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => {
        if (!/^https?:\/\//i.test(value)) {
          return false
        }
        try {
          const url = new URL(value)
          return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
        } catch {
          return false
        }
      },
      { message: 'Must be an absolute HTTP or HTTPS URL' }
    )
const nullableAbsoluteHttpUrlText = (max = 2048) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    absoluteHttpUrlText(max).nullable()
  )
const nullableNonEmptyText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable()
  )
const canonicalBaseUrlText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  absoluteHttpUrlText().nullable().superRefine((value, context) => {
    if (value === null) return
    const url = new URL(value)
    if (url.search || url.hash || url.username || url.password) {
      context.addIssue({
        code: 'custom',
        message: 'Canonical base URL must not contain credentials, a query, or a fragment'
      })
    }
  })
)

const profileLinkUrlText = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => {
      if (value.startsWith('/')) return true
      if (/^mailto:/i.test(value)) return value.length > 7
      if (!/^https?:\/\//i.test(value)) return false
      try {
        const url = new URL(value)
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
      } catch {
        return false
      }
    },
    { message: 'Must be a root-relative, mailto, HTTP, or HTTPS URL' }
  )

const publicCardUrlText = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => {
      if (isSafeRootRelativeUrl(value)) return true
      if (!/^https?:\/\//i.test(value)) return false
      try {
        const url = new URL(value)
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
      } catch {
        return false
      }
    },
    { message: 'Must be a root-relative, HTTP, or HTTPS URL' }
  )

const optionalPublicCardUrlText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  publicCardUrlText.nullable()
)
const homeCardInstanceId = z.string().trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/, 'Invalid card instance id')
  .refine((value) => !['__proto__', 'prototype', 'constructor'].includes(value), 'Reserved card instance id')
  .optional().default(() => crypto.randomUUID())

const navigationItemSchema = z.object({
  label: z.string().trim().min(1).max(100),
  href: z.string().trim().min(1).max(2048)
})

const socialLinkSchema = z.object({
  platform: z.string().trim().min(1).max(50),
  url: z.string().trim().min(1).max(2048)
})

/** Favicon may be an absolute HTTP(S) URL or a same-origin root-relative path such as `/favicon.ico`. */
const faviconUrlText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .trim()
    .max(2048)
    .nullable()
    .refine(
      (value) => {
        if (value === null) return true
        if (value.startsWith('/') && !value.startsWith('//')) {
          return isSafeRootRelativeUrl(value)
        }
        if (!/^https?:\/\//i.test(value)) return false
        try {
          const url = new URL(value)
          return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
        } catch {
          return false
        }
      },
      { message: 'Must be an absolute HTTP(S) URL or a root-relative path (e.g. /favicon.ico)' }
    )
)

export const siteSettingsInputSchema = z.object({
  siteName: z.string().trim().min(1).max(100),
  description: nullableText(500).optional().default(null),
  logoUrl: urlText().nullable().optional().default(null),
  faviconUrl: faviconUrlText.optional().default(null),
  featuredFallbackCover: nullableAbsoluteHttpUrlText().optional().default(null),
  lightTheme: z.enum(siteLightThemeValues).optional().default('default'),
  navigation: z.array(navigationItemSchema).max(50).optional().default([]),
  locale: z.string().trim().min(2).max(35).optional().default('zh-CN'),
  timezone: z.string().trim().min(1).max(64).optional().default('Asia/Shanghai'),
  socialLinks: z.array(socialLinkSchema).max(50).optional().default([])
})

const homeRailTagsCardSchema = z.object({
  type: z.literal('tags'),
  instanceId: homeCardInstanceId,
  enabled: z.boolean().optional().default(true),
  size: z.enum(homeRailCardSizeValues).optional().default('normal'),
  title: z.string().trim().min(1).max(80).optional().default('Tags'),
  collapsedCount: z.number().int().min(1).max(100).optional().default(12)
})

const homeRailBuildLogCardSchema = z.object({
  type: z.literal('build-log'),
  instanceId: homeCardInstanceId,
  enabled: z.boolean().optional().default(true),
  size: z.enum(homeRailCardSizeValues).optional().default('normal'),
  title: z.string().trim().min(1).max(80).optional().default('Build Log'),
  entries: z.array(z.string().trim().min(1).max(200)).max(20).optional().default([])
})

const commonHomeCard = {
  instanceId: homeCardInstanceId,
  enabled: z.boolean().optional().default(false),
  size: z.enum(homeRailCardSizeValues).optional().default('normal'),
  title: z.string().trim().min(1).max(80)
}

const homeRailContentStatsCardSchema = z.object({
  type: z.literal('content-stats'), ...commonHomeCard,
  metrics: z.array(z.enum(homeContentMetricValues)).min(1).max(4)
})

const homeRailSiteHistoryCardSchema = z.object({
  type: z.literal('site-history'), ...commonHomeCard,
  startDate: z.iso.date().nullable(),
  showStartDate: z.boolean(),
  showLastUpdated: z.boolean()
})

const homeRailPublishingRhythmCardSchema = z.object({
  type: z.literal('publishing-rhythm'), ...commonHomeCard,
  weeks: z.number().int().min(4).max(12),
  includeUpdates: z.boolean()
})

const homeFriendLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: absoluteHttpUrlText(),
  description: z.string().trim().max(160),
  logoUrl: nullableAbsoluteHttpUrlText().optional().default(null),
  newTab: z.boolean().optional().default(true)
})

const homeRailFriendLinksCardSchema = z.object({
  type: z.literal('friend-links'), ...commonHomeCard,
  links: z.array(homeFriendLinkSchema).max(20)
})

const homeNavigationLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: publicCardUrlText,
  description: z.string().trim().max(160),
  newTab: z.boolean().optional().default(false)
})

const homeNavigationGroupSchema = z.object({
  label: z.string().trim().min(1).max(80),
  links: z.array(homeNavigationLinkSchema).min(1).max(20)
})

const homeRailNavigationCardSchema = z.object({
  type: z.literal('navigation'), ...commonHomeCard,
  groups: z.array(homeNavigationGroupSchema).max(10)
})

const homeRailCuratedTopicCardSchema = z.object({
  type: z.literal('curated-topic'), ...commonHomeCard,
  eyebrow: z.string().trim().max(80),
  topicTitle: z.string().trim().max(160),
  summary: z.string().trim().max(500),
  coverUrl: nullableAbsoluteHttpUrlText().optional().default(null),
  targetUrl: z.union([publicCardUrlText, z.literal('')]),
  articleSlugs: z.array(z.string().trim().min(1).max(200)).max(30)
})

const homeSeriesChapterSchema = z.object({
  title: z.string().trim().min(1).max(160),
  url: publicCardUrlText,
  published: z.boolean().optional().default(true)
})

const homeRailReadingSeriesCardSchema = z.object({
  type: z.literal('reading-series'), ...commonHomeCard,
  seriesTitle: z.string().trim().max(160),
  status: z.enum(['ongoing', 'complete']),
  chapters: z.array(homeSeriesChapterSchema).max(50),
  showProgress: z.boolean()
})

const homeActivityEntrySchema = z.object({
  date: z.iso.datetime({ offset: true }),
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(300),
  url: optionalPublicCardUrlText.optional().default(null)
})

const homeRailSiteActivityCardSchema = z.object({
  type: z.literal('site-activity'), ...commonHomeCard,
  limit: z.number().int().min(1).max(20),
  includePublished: z.boolean(),
  includeUpdated: z.boolean(),
  manualEntries: z.array(homeActivityEntrySchema).max(30)
})

export const homeSettingsInputSchema = z.object({
  railCards: z.array(z.discriminatedUnion('type', [
    homeRailTagsCardSchema,
    homeRailBuildLogCardSchema,
    homeRailContentStatsCardSchema,
    homeRailSiteHistoryCardSchema,
    homeRailPublishingRhythmCardSchema,
    homeRailFriendLinksCardSchema,
    homeRailNavigationCardSchema,
    homeRailCuratedTopicCardSchema,
    homeRailReadingSeriesCardSchema,
    homeRailSiteActivityCardSchema
  ]))
    .max(50)
    .superRefine((cards, context) => {
      const seen = new Set<string>()
      cards.forEach((card, index) => {
        if (seen.has(card.instanceId)) {
          context.addIssue({ code: 'custom', path: [index, 'instanceId'], message: 'Card instance ids must be unique' })
        }
        seen.add(card.instanceId)
      })
    })
}).refine(fitsD1SettingsJson, d1SettingsJsonLimit)

const profileSocialLinkSchema = z.object({
  platform: z.string().trim().min(1).max(50),
  url: profileLinkUrlText,
  visible: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(10_000).optional().default(0)
})

const profileProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000),
  status: z.string().trim().min(1).max(50),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional().default([]),
  url: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    profileLinkUrlText.nullable()
  ).optional().default(null),
  visible: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(10_000).optional().default(0)
})

const profileJourneyEntrySchema = z.object({
  period: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  role: z.string().trim().max(120),
  description: z.string().trim().max(1000),
  visible: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(10_000).optional().default(0)
})

export const profileSettingsInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(160),
  avatarUrl: nullableAbsoluteHttpUrlText().optional().default(null),
  shortBio: z.string().trim().max(300),
  signature: z.string().trim().max(500),
  introduction: z.string().trim().max(3000),
  topics: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
  currentStatus: z.string().trim().max(200),
  location: nullableText(120).optional().default(null),
  socialLinks: z.array(profileSocialLinkSchema).max(30).optional().default([]),
  projects: z.array(profileProjectSchema).max(30).optional().default([]),
  journeyEnabled: z.boolean().optional().default(false),
  journey: z.array(profileJourneyEntrySchema).max(50).optional().default([])
})

export const seoSettingsInputSchema = z.object({
  defaultTitle: nullableNonEmptyText(200).optional().default(null),
  defaultDescription: nullableNonEmptyText(500).optional().default(null),
  canonicalBaseUrl: canonicalBaseUrlText.optional().default(null),
  rssEnabled: z.boolean().optional().default(true),
  sitemapEnabled: z.boolean().optional().default(true),
  robotsPolicy: z
    .enum(['index,follow', 'index,nofollow', 'noindex,follow', 'noindex,nofollow'])
    .optional()
    .default('index,follow')
})

export const commentSettingsInputSchema = z.object({
  enabled: z.boolean().optional().default(true),
  autoModerationEnabled: z.boolean().optional().default(false),
  turnstileSiteKey: nullableText(200).optional().default(null),
  rateLimit: z
    .object({
      // null = use runtime defaults (60s / 5). Zero is rejected so "off" is never ambiguous.
      windowSeconds: z.number().int().min(1).max(86_400).nullable().optional().default(null),
      maxPerWindow: z.number().int().min(1).max(1_000).nullable().optional().default(null)
    })
    .optional()
    .default({ windowSeconds: null, maxPerWindow: null })
})

export const mediaSettingsInputSchema = z.object({
  externalUrlMode: z.boolean().optional().default(true),
  imageProviderKey: nullableText(100).optional().default(null),
  urlTemplates: z.record(z.string(), z.string().trim().max(2048)).optional().default({}),
  storageProviderStatus: nullableText(100).optional().default(null)
}).refine(fitsD1SettingsJson, d1SettingsJsonLimit)

export const securitySettingsInputSchema = z.object({
  sessionTtlSeconds: z
    .number()
    .int()
    .min(60)
    .max(31_536_000)
    .optional()
    .default(DEFAULT_SESSION_TTL_SECONDS),
  setupLocked: z.boolean().optional().default(false),
  allowedOrigins: z.array(z.string().trim().min(1).max(2048)).max(100).optional().default([])
})

export const searchSettingsInputSchema = z.object({
  enabled: z.boolean().optional().default(false),
  providerKey: nullableText(100).optional().default(null),
  publicConfig: z.record(z.string(), z.unknown()).optional().default({}),
  indexingStatus: nullableText(100).optional().default(null),
  lastIndexedAt: z.number().int().nullable().optional().default(null),
  lastError: nullableText(2000).optional().default(null)
}).refine(fitsD1SettingsJson, d1SettingsJsonLimit)

export const settingsInputSchemas = {
  site: siteSettingsInputSchema,
  home: homeSettingsInputSchema,
  profile: profileSettingsInputSchema,
  seo: seoSettingsInputSchema,
  comment: commentSettingsInputSchema,
  media: mediaSettingsInputSchema,
  security: securitySettingsInputSchema,
  search: searchSettingsInputSchema
} satisfies { [Domain in SettingsDomain]: z.ZodType<SettingsByDomain[Domain]> }

export function parseSettingsInput<TDomain extends SettingsDomain>(
  domain: TDomain,
  body: unknown
): SettingsByDomain[TDomain] {
  return settingsInputSchemas[domain].parse(body) as SettingsByDomain[TDomain]
}
