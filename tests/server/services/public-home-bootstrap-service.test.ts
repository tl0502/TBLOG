import { describe, expect, it, vi } from 'vitest'
import { createPublicHomeBootstrapService } from '../../../server/services/public-home-bootstrap-service'
import type { PublicPostListItem } from '../../../server/repositories/contracts/public-read-repositories'

function article(id: string): PublicPostListItem {
  return {
    id,
    slug: id,
    title: `Post ${id}`,
    cover: null,
    excerpt: null,
    readingTime: 2,
    publishedAt: new Date('2026-07-01T00:00:00.000Z'),
    category: null,
    tags: []
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const query = { page: 1, limit: 25, sort: 'publishedAt' as const, order: 'desc' as const }

describe('public home bootstrap service', () => {
  it('starts every homepage read together and maps the complete payload', async () => {
    const feed = deferred<{
      items: PublicPostListItem[]
      page: number
      pageSize: number
      total: number
      pageCount: number
      sort: 'publishedAt'
      order: 'desc'
    }>()
    const featured = deferred<PublicPostListItem[]>()
    const hotspots = deferred<{ current: []; historical: [] }>()
    const homeRail = deferred<{ cards: Record<string, never> }>()
    const tags = deferred<[]>()
    const dependencies = {
      getFeed: vi.fn(() => feed.promise),
      getFeatured: vi.fn(() => featured.promise),
      getHotspots: vi.fn(() => hotspots.promise),
      getHomeRail: vi.fn(() => homeRail.promise),
      getTags: vi.fn(() => tags.promise)
    }
    const service = createPublicHomeBootstrapService(dependencies)

    const pending = service.getBootstrap(query)

    expect(dependencies.getFeed).toHaveBeenCalledWith(query)
    expect(dependencies.getFeatured).toHaveBeenCalledOnce()
    expect(dependencies.getHotspots).toHaveBeenCalledOnce()
    expect(dependencies.getHomeRail).toHaveBeenCalledOnce()
    expect(dependencies.getTags).toHaveBeenCalledOnce()

    const item = article('one')
    feed.resolve({
      items: [item], page: 1, pageSize: 25, total: 1, pageCount: 1,
      sort: 'publishedAt', order: 'desc'
    })
    featured.resolve([item])
    hotspots.resolve({ current: [], historical: [] })
    homeRail.resolve({ cards: {} })
    tags.resolve([])

    await expect(pending).resolves.toEqual({
      data: {
        feed: {
          items: [item],
          meta: {
            page: 1, pageSize: 25, total: 1, pageCount: 1,
            sort: 'publishedAt', order: 'desc'
          }
        },
        featured: [item],
        hotspots: { current: [], historical: [] },
        homeRail: { cards: {} },
        tags: []
      },
      degraded: []
    })
  })

  it('preserves valid empty optional sections', async () => {
    const service = createPublicHomeBootstrapService({
      getFeed: vi.fn().mockResolvedValue({
        items: [], page: 1, pageSize: 25, total: 0, pageCount: 0,
        sort: 'publishedAt', order: 'desc'
      }),
      getFeatured: vi.fn().mockResolvedValue([]),
      getHotspots: vi.fn().mockResolvedValue({ current: [], historical: [] }),
      getHomeRail: vi.fn().mockResolvedValue({ cards: {} }),
      getTags: vi.fn().mockResolvedValue([])
    })

    await expect(service.getBootstrap(query)).resolves.toEqual({
      data: {
        feed: {
          items: [],
          meta: {
            page: 1, pageSize: 25, total: 0, pageCount: 0,
            sort: 'publishedAt', order: 'desc'
          }
        },
        featured: [],
        hotspots: { current: [], historical: [] },
        homeRail: { cards: {} },
        tags: []
      },
      degraded: []
    })
  })

  it('degrades optional component failures after starting all reads', async () => {
    const failure = new Error('hotspot unavailable')
    const item = article('fallback')
    const dependencies = {
      getFeed: vi.fn().mockResolvedValue({
        items: [item], page: 1, pageSize: 25, total: 1, pageCount: 1,
        sort: 'publishedAt', order: 'desc'
      }),
      getFeatured: vi.fn().mockRejectedValue(new Error('featured unavailable')),
      getHotspots: vi.fn().mockRejectedValue(failure),
      getHomeRail: vi.fn().mockRejectedValue(new Error('rail unavailable')),
      getTags: vi.fn().mockRejectedValue(new Error('tags unavailable'))
    }
    const service = createPublicHomeBootstrapService(dependencies)

    await expect(service.getBootstrap(query)).resolves.toEqual({
      data: {
        feed: {
          items: [item],
          meta: {
            page: 1, pageSize: 25, total: 1, pageCount: 1,
            sort: 'publishedAt', order: 'desc'
          }
        },
        featured: [item],
        hotspots: { current: [], historical: [] },
        homeRail: { cards: {} },
        tags: []
      },
      degraded: ['featured', 'hotspots', 'homeRail', 'tags']
    })
    expect(Object.values(dependencies).every((read) => read.mock.calls.length === 1)).toBe(true)
  })

  it('keeps the feed required', async () => {
    const failure = new Error('feed unavailable')
    const service = createPublicHomeBootstrapService({
      getFeed: vi.fn().mockRejectedValue(failure),
      getFeatured: vi.fn().mockResolvedValue([]),
      getHotspots: vi.fn().mockResolvedValue({ current: [], historical: [] }),
      getHomeRail: vi.fn().mockResolvedValue({ cards: {} }),
      getTags: vi.fn().mockResolvedValue([])
    })

    await expect(service.getBootstrap(query)).rejects.toBe(failure)
  })
})
