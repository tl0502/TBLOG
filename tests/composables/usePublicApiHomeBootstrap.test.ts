import { shallowRef } from 'vue'
import { useHomeBootstrap, useHomeShell, type HomeFeedQuery } from '../../composables/usePublicApi'

const staleFirst = vi.hoisted(() => ({ use: vi.fn(), prefetch: vi.fn() }))

vi.mock('~/composables/useStaleFirstPublicResource', () => ({
  publicResourceKey: (prefix: string, query: Record<string, unknown> = {}) => `${prefix}:${JSON.stringify(query)}`,
  useStaleFirstPublicResource: staleFirst.use,
  prefetchStaleFirstPublicResource: staleFirst.prefetch
}))

describe('public home bootstrap API helper', () => {
  afterEach(() => {
    staleFirst.use.mockReset()
    staleFirst.prefetch.mockReset()
  })

  it('loads all homepage-specific data through one reactive request', () => {
    const query = shallowRef<HomeFeedQuery>({
      page: 1,
      limit: 25,
      sort: 'publishedAt',
      order: 'desc'
    })

    useHomeBootstrap(query)

    expect(staleFirst.use).toHaveBeenCalledOnce()
    expect(staleFirst.use.mock.calls[0]?.[0]).toBe('/api/v1/home')
    const options = staleFirst.use.mock.calls[0]?.[1] as { query: { value: HomeFeedQuery } }
    expect(options.query.value).toEqual(query.value)

    query.value = { ...query.value, page: 2, sort: 'pageViews' }
    expect(options.query.value).toEqual(query.value)
  })

  it('loads the homepage shell without the feed D1 read', () => {
    useHomeShell()

    expect(staleFirst.use).toHaveBeenCalledOnce()
    expect(staleFirst.use.mock.calls[0]?.[0]).toBe('/api/v1/home')
    const options = staleFirst.use.mock.calls[0]?.[1] as {
      key: string
      query: { includeFeed: number }
      freshMs: number
    }
    expect(options.key).toContain('home-shell')
    expect(options.query.includeFeed).toBe(0)
    expect(options.freshMs).toBe(120_000)
  })
})
