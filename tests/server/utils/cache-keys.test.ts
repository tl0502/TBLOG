import { cacheKeys } from '../../../server/utils/cache-keys'
import { createNoOpCacheProvider } from '../../../server/providers/cache/no-op-cache-provider'

describe('cache keys', () => {
  it('builds resource-oriented keys', () => {
    expect(cacheKeys.post('p1')).toBe('post:p1')
    expect(cacheKeys.postSlug('hello-world')).toBe('post-slug:hello-world')
    expect(cacheKeys.category('c1')).toBe('category:c1')
    expect(cacheKeys.tag('t1')).toBe('tag:t1')
    expect(cacheKeys.home()).toBe('home:v2')
    expect(cacheKeys.featuredPost()).toBe('featured-post:v2')
    expect(cacheKeys.archive()).toBe('archive')
    expect(cacheKeys.rss()).toBe('rss')
    expect(cacheKeys.sitemap()).toBe('sitemap')
  })
})

describe('no-op cache provider', () => {
  it('misses on read and accepts writes without storing', async () => {
    const cache = createNoOpCacheProvider()

    await cache.set('home', { any: 'value' })
    await cache.delete(['home'])

    await expect(cache.get('home')).resolves.toBeNull()
  })
})
