export const cacheKeys = {
  postSlug: (slug: string) => `post-slug:${slug}`,
  category: (id: string) => `category:${id}`,
  tag: (id: string) => `tag:${id}`,
  home: () => 'home:v2',
  featuredPost: () => 'featured-post:v2',
  hotspots: () => 'hotspots:v1',
  archive: () => 'archive',
  rss: () => 'rss',
  sitemap: () => 'sitemap',
  siteSettings: () => 'site-settings'
} as const
