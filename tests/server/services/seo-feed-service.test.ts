import { createSeoFeedService } from '../../../server/services/seo-feed-service'
import { createNoOpCacheProvider } from '../../../server/providers/cache/no-op-cache-provider'
import { settingsDefaults, type SeoSettings, type SiteSettings } from '../../../server/domain/settings'
import type { SettingsRepository } from '../../../server/repositories/contracts/settings-repositories'
import type {
  FeedPostRef,
  PostReadRepository,
  PublicCategory,
  PublicTag,
  TaxonomyReadRepository
} from '../../../server/repositories/contracts/public-read-repositories'

const JUN = new Date('2026-06-01T00:00:00.000Z')
const MAY = new Date('2026-05-02T00:00:00.000Z')
const MAR = new Date('2026-03-01T00:00:00.000Z')

function feedPosts(): FeedPostRef[] {
  return [
    { slug: 'a', title: 'First & Best <post>', excerpt: 'Excerpt <A>', type: 'article', publishedAt: JUN, updatedAt: JUN },
    { slug: 'b', title: 'Second', excerpt: null, type: 'article', publishedAt: MAY, updatedAt: MAY },
    { slug: 'about', title: 'About', excerpt: 'About page', type: 'page', publishedAt: MAR, updatedAt: MAR },
    { slug: 'contact', title: 'Contact', excerpt: 'Contact page', type: 'page', publishedAt: MAR, updatedAt: MAR }
  ]
}

function fakePostRepo(posts: FeedPostRef[] = feedPosts()): PostReadRepository {
  return {
    listHomeArticles: async (query) => ({ items: [], page: query.page, pageSize: query.limit, total: 0, pageCount: 0, sort: query.sort, order: query.order }),
    listPublishedArticles: async () => ({ items: [], nextCursor: null }),
    findPublishedDetailBySlug: async () => null,
    listPublishedArticlesByCategorySlug: async () => ({ items: [], nextCursor: null }),
    listPublishedArticlesByTagSlug: async () => ({ items: [], nextCursor: null }),
    listArchive: async () => [],
    listFeedPosts: async () => posts,
    listPublishedArticleIds: async () => [],
    listPublishedArticlesByIds: async () => []
  }
}

function fakeTaxonomyRepo(
  categories: PublicCategory[] = [
    { slug: 'web', name: 'Web', description: null, color: null, articleCount: 2 },
    { slug: 'empty', name: 'Empty', description: null, color: null, articleCount: 0 }
  ],
  tags: PublicTag[] = [
    { slug: 'nuxt', name: 'Nuxt', description: null, color: null, articleCount: 1 },
    { slug: 'unused', name: 'Unused', description: null, color: null, articleCount: 0 }
  ]
): TaxonomyReadRepository {
  return {
    listCategoriesWithCounts: async () => categories,
    findCategoryBySlug: async () => null,
    listTagsWithCounts: async () => tags,
    findTagBySlug: async () => null
  }
}

function fakeSettingsRepo(seo: Partial<SeoSettings> = {}, site: Partial<SiteSettings> = {}): SettingsRepository {
  const seoValue: SeoSettings = { ...settingsDefaults.seo, canonicalBaseUrl: 'https://blog.example', ...seo }
  const siteValue: SiteSettings = { ...settingsDefaults.site, siteName: 'My Blog', ...site }
  return {
    async getDomain(domain) {
      if (domain === 'seo') return seoValue as never
      if (domain === 'site') return siteValue as never
      return settingsDefaults[domain] as never
    },
    async getProfileSnapshot() {
      return { value: settingsDefaults.profile, revision: null }
    },
    async saveDomain() {},
    async saveProfileIfRevision() { return null }
  }
}

function build(overrides: {
  seo?: Partial<SeoSettings>
  site?: Partial<SiteSettings>
  posts?: FeedPostRef[]
  taxonomy?: TaxonomyReadRepository
} = {}) {
  return createSeoFeedService({
    settingsRepository: fakeSettingsRepo(overrides.seo, overrides.site),
    postReadRepository: fakePostRepo(overrides.posts),
    taxonomyReadRepository: overrides.taxonomy ?? fakeTaxonomyRepo(),
    cache: createNoOpCacheProvider(),
    fallbackBaseUrl: 'http://localhost:3000',
    now: () => new Date('2026-07-01T00:00:00.000Z')
  })
}

describe('seo feed service - rss', () => {
  it('returns null when RSS is disabled', async () => {
    const service = build({ seo: { rssEnabled: false } })
    expect(await service.getRssFeed()).toBeNull()
  })

  it('lists published articles only, newest first, with escaped fields and absolute links', async () => {
    const feed = await build().getRssFeed()
    const xml = feed!.xml

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<title>My Blog</title>')
    expect(xml).toContain('<link>https://blog.example/</link>')
    // Article items, escaped.
    expect(xml).toContain('<title>First &amp; Best &lt;post&gt;</title>')
    expect(xml).toContain('<link>https://blog.example/posts/a</link>')
    expect(xml).toContain('<guid isPermaLink="true">https://blog.example/posts/a</guid>')
    expect(xml).toContain('<pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate>')
    expect(xml).toContain('<description>Excerpt &lt;A&gt;</description>')
    // Pages are never in the feed.
    expect(xml).not.toContain('/posts/about')
    expect(xml).not.toContain('<title>About</title>')
    expect(xml).not.toContain('/posts/contact')
    expect(xml).not.toContain('<title>Contact</title>')
    // Exactly two article items.
    expect(xml.match(/<item>/g)).toHaveLength(2)
  })

  it('produces a valid feed with zero items when there are no articles', async () => {
    const service = build({ posts: [{ slug: 'about', title: 'About', excerpt: null, type: 'page', publishedAt: MAR, updatedAt: MAR }] })
    const xml = (await service.getRssFeed())!.xml

    expect(xml).toContain('<channel>')
    expect(xml).toContain('</rss>')
    expect(xml).not.toContain('<item>')
  })

  it('uses the runtime fallback base URL when no canonical base URL is configured', async () => {
    const service = build({ seo: { canonicalBaseUrl: null } })
    const xml = (await service.getRssFeed())!.xml
    expect(xml).toContain('<link>http://localhost:3000/posts/a</link>')
  })
})

describe('seo feed service - sitemap', () => {
  it('returns null when the sitemap is disabled', async () => {
    const service = build({ seo: { sitemapEnabled: false } })
    expect(await service.getSitemap()).toBeNull()
  })

  it('lists static, article, about, and non-empty taxonomy URLs', async () => {
    const xml = (await build().getSitemap())!.xml

    expect(xml).toContain('<loc>https://blog.example/</loc>')
    expect(xml).toContain('<loc>https://blog.example/archive</loc>')
    expect(xml).toContain('<loc>https://blog.example/categories</loc>')
    expect(xml).toContain('<loc>https://blog.example/tags</loc>')
    expect(xml).toContain('<loc>https://blog.example/posts/a</loc>')
    expect(xml).toContain('<lastmod>2026-06-01T00:00:00Z</lastmod>')
    // The About page maps to its dedicated route, not /posts/about.
    expect(xml).toContain('<loc>https://blog.example/about</loc>')
    expect(xml).not.toContain('/posts/about')
    // Other page types are not part of the public sitemap surface.
    expect(xml).not.toContain('/posts/contact')
    // Only non-empty taxonomy pages appear.
    expect(xml).toContain('<loc>https://blog.example/categories/web</loc>')
    expect(xml).toContain('<loc>https://blog.example/tags/nuxt</loc>')
    expect(xml).not.toContain('/categories/empty')
    expect(xml).not.toContain('/tags/unused')
  })
})

describe('seo feed service - robots', () => {
  it('blocks admin surfaces and advertises the sitemap under the default policy', async () => {
    const { text } = await build().getRobotsTxt()
    expect(text).toBe(
      'User-agent: *\nDisallow: /admin\nDisallow: /api/v1/admin\nSitemap: https://blog.example/sitemap.xml\n'
    )
  })

  it('keeps public pages crawlable so noindex metadata can be observed', async () => {
    const { text } = await build({ seo: { robotsPolicy: 'noindex, nofollow' } }).getRobotsTxt()
    expect(text).toContain('Disallow: /admin\n')
    expect(text).not.toContain('Disallow: /\n')
  })

  it('omits the sitemap line when the sitemap is disabled', async () => {
    const { text } = await build({ seo: { sitemapEnabled: false } }).getRobotsTxt()
    expect(text).toBe('User-agent: *\nDisallow: /admin\nDisallow: /api/v1/admin\n')
  })
})
