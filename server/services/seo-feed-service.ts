import type { CacheProvider } from '../providers/cache/cache-provider'
import type { SeoSettings, SiteSettings } from '../domain/settings'
import type { SettingsRepository } from '../repositories/contracts/settings-repositories'
import type {
  FeedPostRef,
  PostReadRepository,
  PublicCategory,
  PublicTag,
  TaxonomyReadRepository
} from '../repositories/contracts/public-read-repositories'
import { cacheKeys } from '../utils/cache-keys'
import { absoluteUrl, resolvePublicBaseUrl } from '../utils/public-base-url'
import { escapeXml, toRfc822, toW3CDate } from '../utils/xml'

/** Newest published articles to include in the RSS feed. */
const RSS_ITEM_LIMIT = 50

export interface SeoFeedServiceDependencies {
  settingsRepository: SettingsRepository
  postReadRepository: PostReadRepository
  taxonomyReadRepository: TaxonomyReadRepository
  cache: CacheProvider
  /** `NUXT_PUBLIC_SITE_URL` fallback used when `seo.canonicalBaseUrl` is unset. */
  fallbackBaseUrl: string
  now?: () => Date
}

interface SitemapEntry {
  loc: string
  lastmod?: Date
}

/**
 * Composes published content and SEO/site settings into the public syndication surfaces: RSS,
 * sitemap, and robots.txt. Everything is derived from stored, already-processed content — public
 * Markdown is never rendered here. Feeds are hand-built XML with explicit escaping so a stored title
 * or excerpt can never break the document. RSS and sitemap gate on their SEO toggles; robots.txt
 * always responds and derives crawl rules from the robots policy.
 */
export function createSeoFeedService(dependencies: SeoFeedServiceDependencies) {
  const { settingsRepository, postReadRepository, taxonomyReadRepository, cache, fallbackBaseUrl } =
    dependencies
  const now = dependencies.now ?? (() => new Date())

  function baseUrlFor(seo: SeoSettings): string {
    return resolvePublicBaseUrl({ canonicalBaseUrl: seo.canonicalBaseUrl, fallbackUrl: fallbackBaseUrl })
  }

  async function readThrough(key: string, loader: () => Promise<string>): Promise<string> {
    const cached = await cache.get<string>(key)
    if (cached !== null) {
      return cached
    }
    const value = await loader()
    await cache.set(key, value)
    return value
  }

  function articleUrl(base: string, post: FeedPostRef): string {
    // The About page has a dedicated /about route; every other post renders at /posts/:slug.
    if (post.type === 'page' && post.slug === 'about') {
      return absoluteUrl(base, '/about')
    }
    return absoluteUrl(base, `/posts/${post.slug}`)
  }

  async function buildRss(seo: SeoSettings, site: SiteSettings): Promise<string> {
    const base = baseUrlFor(seo)
    const posts = await postReadRepository.listFeedPosts()
    const articles = posts.filter((post) => post.type === 'article').slice(0, RSS_ITEM_LIMIT)

    const channelDescription = seo.defaultDescription?.trim() || site.description?.trim() || site.siteName
    const items = articles.map((post) => {
      const link = absoluteUrl(base, `/posts/${post.slug}`)
      const description = post.excerpt ? `\n      <description>${escapeXml(post.excerpt)}</description>` : ''
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${toRfc822(post.publishedAt)}</pubDate>${description}`,
        '    </item>'
      ].join('\n')
    })

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      '  <channel>',
      `    <title>${escapeXml(site.siteName)}</title>`,
      `    <link>${escapeXml(absoluteUrl(base, '/'))}</link>`,
      `    <description>${escapeXml(channelDescription)}</description>`,
      `    <language>${escapeXml(site.locale)}</language>`,
      `    <atom:link href="${escapeXml(absoluteUrl(base, '/rss.xml'))}" rel="self" type="application/rss+xml"/>`,
      `    <lastBuildDate>${toRfc822(now())}</lastBuildDate>`,
      ...items,
      '  </channel>',
      '</rss>',
      ''
    ].join('\n')
  }

  async function buildSitemap(seo: SeoSettings): Promise<string> {
    const base = baseUrlFor(seo)
    const [posts, categories, tags] = await Promise.all([
      postReadRepository.listFeedPosts(),
      taxonomyReadRepository.listCategoriesWithCounts(),
      taxonomyReadRepository.listTagsWithCounts()
    ])

    const entries: SitemapEntry[] = [
      { loc: absoluteUrl(base, '/') },
      { loc: absoluteUrl(base, '/archive') },
      { loc: absoluteUrl(base, '/categories') },
      { loc: absoluteUrl(base, '/tags') }
    ]

    const publicPosts = posts.filter(
      (post) => post.type === 'article' || (post.type === 'page' && post.slug === 'about')
    )
    for (const post of publicPosts) {
      entries.push({ loc: articleUrl(base, post), lastmod: post.updatedAt })
    }
    // Only non-empty taxonomy pages are worth indexing.
    for (const category of categories.filter((item: PublicCategory) => item.articleCount > 0)) {
      entries.push({ loc: absoluteUrl(base, `/categories/${category.slug}`) })
    }
    for (const tag of tags.filter((item: PublicTag) => item.articleCount > 0)) {
      entries.push({ loc: absoluteUrl(base, `/tags/${tag.slug}`) })
    }

    const urls = entries.map((entry) => {
      const lastmod = entry.lastmod ? `\n    <lastmod>${toW3CDate(entry.lastmod)}</lastmod>` : ''
      return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${lastmod}\n  </url>`
    })

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls,
      '</urlset>',
      ''
    ].join('\n')
  }

  function buildRobots(seo: SeoSettings): string {
    const base = baseUrlFor(seo)
    // Public pages stay crawlable so HTML `meta robots` (including site-wide noindex) can be
    // observed. Admin surfaces are blocked here and also emit noindex in the admin layout.
    const lines = [
      'User-agent: *',
      'Disallow: /admin',
      'Disallow: /api/v1/admin'
    ]
    if (seo.sitemapEnabled) {
      lines.push(`Sitemap: ${absoluteUrl(base, '/sitemap.xml')}`)
    }
    return `${lines.join('\n')}\n`
  }

  return {
    async getRssFeed(): Promise<{ xml: string } | null> {
      const seo = await settingsRepository.getDomain('seo')
      if (!seo.rssEnabled) {
        return null
      }
      const site = await settingsRepository.getDomain('site')
      const xml = await readThrough(cacheKeys.rss(), () => buildRss(seo, site))
      return { xml }
    },

    async getSitemap(): Promise<{ xml: string } | null> {
      const seo = await settingsRepository.getDomain('seo')
      if (!seo.sitemapEnabled) {
        return null
      }
      const xml = await readThrough(cacheKeys.sitemap(), () => buildSitemap(seo))
      return { xml }
    },

    async getRobotsTxt(): Promise<{ text: string }> {
      const seo = await settingsRepository.getDomain('seo')
      return { text: buildRobots(seo) }
    }
  }
}

export type SeoFeedService = ReturnType<typeof createSeoFeedService>
