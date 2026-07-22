const staleFirst = vi.hoisted(() => ({
  use: vi.fn()
}))

vi.mock('~/composables/useStaleFirstPublicResource', () => ({
  publicResourceKey: (prefix: string) => `public:${prefix}`,
  useStaleFirstPublicResource: staleFirst.use
}))

import {
  MAX_SEARCH_QUERY_LENGTH,
  searchAlgolia,
  useSearchConfig
} from '../../composables/usePublicSearch'

describe('public Algolia search', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    staleFirst.use.mockReset()
  })

  it('can keep header search configuration out of SSR', () => {
    useSearchConfig({ server: false })

    expect(staleFirst.use).toHaveBeenCalledWith('/api/v1/search-config', {
      key: 'public:search-config',
      server: false
    })
  })

  it('encodes the index name in the request path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hits: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    vi.stubGlobal('fetch', fetchMock)

    await searchAlgolia(
      { appId: 'APP1', searchOnlyKey: 'search-key', indexName: '中文 posts' },
      'hello'
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://APP1-dsn.algolia.net/1/indexes/%E4%B8%AD%E6%96%87%20posts/query',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('bounds the query and forwards an abort signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hits: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await searchAlgolia(
      { appId: 'APP1', searchOnlyKey: 'search-key', indexName: 'posts' },
      `  ${'中'.repeat(MAX_SEARCH_QUERY_LENGTH + 20)}  `,
      controller.signal
    )

    const init = fetchMock.mock.calls[0][1]
    expect(init.signal).toBe(controller.signal)
    expect(JSON.parse(init.body).query).toHaveLength(MAX_SEARCH_QUERY_LENGTH)
  })

  it('forwards bounded pagination and returns Algolia result metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      hits: [], nbHits: 42, page: 2, nbPages: 5
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchAlgolia(
      { appId: 'APP1', searchOnlyKey: 'search-key', indexName: 'posts' },
      'nuxt',
      undefined,
      { page: 2, hitsPerPage: 100 }
    )

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ page: 2, hitsPerPage: 50 })
    expect(result).toMatchObject({ nbHits: 42, page: 2, nbPages: 5, error: false })
  })
})
