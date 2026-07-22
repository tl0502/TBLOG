import { describe, expect, it, vi } from 'vitest'
import { createPublicHotspotService } from '../../../server/services/public-hotspot-service'
import type { PublicPostListItem } from '../../../server/repositories/contracts/public-read-repositories'

function article(id: string): PublicPostListItem {
  return {
    id,
    slug: id,
    title: `Post ${id}`,
    cover: null,
    excerpt: null,
    readingTime: 3,
    publishedAt: new Date('2026-07-01T00:00:00Z'),
    category: null,
    tags: []
  }
}

function repository(fallback: PublicPostListItem[], ranked: PublicPostListItem[]) {
  return {
    listPublishedArticles: vi.fn().mockResolvedValue({ items: fallback, nextCursor: null }),
    listPublishedArticlesByIds: vi.fn().mockResolvedValue(ranked),
    listPublishedArticlesBySlugs: vi.fn()
  }
}

describe('public hotspot service', () => {
  it('hydrates report ranks, calculates trends, and fills short lists with current articles', async () => {
    const posts = repository([article('a'), article('b'), article('c'), article('d')], [article('a'), article('b'), article('d')])
    const service = createPublicHotspotService({
      analyticsReportService: {
        getCurrentReport: vi.fn().mockResolvedValue({
          currentHotspots: [
            { postId: 'a', pageViews: 10, previousPageViews: 3 },
            { postId: 'b', pageViews: 5, previousPageViews: 7 },
            { postId: 'missing', pageViews: 99, previousPageViews: 0 }
          ],
          historicalHotspots: [{ postId: 'd', pageViews: 80 }]
        })
      } as never,
      postReadRepository: posts
    })

    const result = await service.getHotspots()

    expect(result.current.map((item) => [item.article.id, item.pageViews, item.trend, item.fallback])).toEqual([
      ['a', 10, 'up', false],
      ['b', 5, 'down', false],
      ['c', null, null, true]
    ])
    expect(result.historical.map((item) => [item.article.id, item.pageViews])).toEqual([
      ['d', 80], ['a', null], ['b', null], ['c', null]
    ])
    expect(posts.listPublishedArticlesByIds).toHaveBeenCalledWith(['a', 'b', 'missing', 'd'])
  })

  it('returns no hotspots and performs no article reads when the report is unavailable', async () => {
    const posts = repository([], [])
    const service = createPublicHotspotService({
      analyticsReportService: { getCurrentReport: vi.fn().mockResolvedValue(null) } as never,
      postReadRepository: posts
    })

    await expect(service.getHotspots()).resolves.toEqual({ current: [], historical: [] })
    expect(posts.listPublishedArticles).not.toHaveBeenCalled()
    expect(posts.listPublishedArticlesByIds).not.toHaveBeenCalled()
  })

  it('caps historical output at ten unique published articles', async () => {
    const ranked = Array.from({ length: 12 }, (_, index) => article(`p${index}`))
    const posts = repository([], ranked)
    const service = createPublicHotspotService({
      analyticsReportService: {
        getCurrentReport: vi.fn().mockResolvedValue({
          currentHotspots: [],
          historicalHotspots: ranked.map((item, index) => ({ postId: item.id, pageViews: 100 - index }))
        })
      } as never,
      postReadRepository: posts
    })

    const result = await service.getHotspots()
    expect(result.historical).toHaveLength(10)
  })
})
