import { shallowRef } from 'vue'
import { useHomeBootstrap, type HomeFeedQuery } from '../../composables/usePublicApi'

const staleFirst = vi.hoisted(() => ({ use: vi.fn() }))

vi.mock('~/composables/useStaleFirstPublicResource', () => ({
  publicResourceKey: (prefix: string, query: Record<string, unknown> = {}) => `${prefix}:${JSON.stringify(query)}`,
  useStaleFirstPublicResource: staleFirst.use
}))

describe('public home bootstrap API helper', () => {
  afterEach(() => {
    staleFirst.use.mockReset()
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
})
