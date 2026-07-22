import {
  checkAlgoliaSearchReadiness,
  createAlgoliaSearchProvider
} from '../../../server/providers/search/algolia-search-provider'
import type { SearchRecord } from '../../../server/providers/search/search-provider'

const options = { appId: 'APPID', adminKey: 'admin-secret', indexName: 'posts' }

function makeRecord(objectID: string): SearchRecord {
  return {
    objectID,
    title: `Title ${objectID}`,
    slug: `slug-${objectID}`,
    excerpt: null,
    body: 'body text',
    category: { slug: 'cat', name: 'Cat' },
    tags: [{ slug: 'tag', name: 'Tag' }],
    publishedAt: 1_700_000_000
  }
}

function okResponse(status = 200, json: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => '',
    json: async () => json
  } as unknown as Response
}

function errorResponse(status: number, text: string): Response {
  return { ok: false, status, text: async () => text } as unknown as Response
}

afterEach(() => vi.restoreAllMocks())

describe('algolia search provider', () => {
  it('indexRecord PUTs to the object URL with headers and body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider({ ...options, now: () => 99 })
    const record = makeRecord('a b')

    await provider.indexRecord(record)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://APPID.algolia.net/1/indexes/posts/a%20b')
    expect(init.method).toBe('PUT')
    expect(init.headers).toEqual({
      'X-Algolia-API-Key': 'admin-secret',
      'X-Algolia-Application-Id': 'APPID',
      'Content-Type': 'application/json'
    })
    expect(JSON.parse(init.body)).toEqual(record)
  })

  it('bounds every request with the default provider timeout', async () => {
    const signal = new AbortController().signal
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal)
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider(options)

    await provider.indexRecord(makeRecord('1'))

    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(fetchMock.mock.calls[0][1].signal).toBe(signal)
  })

  it('clamps configured request timeouts to the safe provider range', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await createAlgoliaSearchProvider({ ...options, requestTimeoutMs: 10 }).removeRecord('1')
    await createAlgoliaSearchProvider({ ...options, requestTimeoutMs: 60_000 }).removeRecord('2')

    expect(timeout).toHaveBeenNthCalledWith(1, 1_000)
    expect(timeout).toHaveBeenNthCalledWith(2, 30_000)
  })

  it('removeRecord DELETEs the object URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider(options)

    await provider.removeRecord('a b')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://APPID.algolia.net/1/indexes/posts/a%20b')
    expect(init.method).toBe('DELETE')
  })

  it('removeRecord treats 404 as a no-op', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(404, 'not found'))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider(options)

    await expect(provider.removeRecord('missing')).resolves.toBeUndefined()
  })

  it('replaceAllRecords builds a temp index then atomically moves it over the live index', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider({ ...options, now: () => 12345 })
    const records = [makeRecord('1'), makeRecord('2')]

    await provider.replaceAllRecords(records)

    // Copy existing settings/rules/synonyms + required settings + batch + atomic move.
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0][0]).toBe('https://APPID.algolia.net/1/indexes/posts/operation')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      operation: 'copy',
      destination: 'posts_reindex_12345',
      scope: ['settings', 'synonyms', 'rules']
    })
    expect(fetchMock.mock.calls[1][0]).toBe('https://APPID.algolia.net/1/indexes/posts_reindex_12345/settings')
    const [batchUrl, batchInit] = fetchMock.mock.calls[2]
    expect(batchUrl).toBe('https://APPID.algolia.net/1/indexes/posts_reindex_12345/batch')
    expect(batchInit.method).toBe('POST')
    expect(JSON.parse(batchInit.body)).toEqual({
      requests: records.map((record) => ({ action: 'addObject', body: record }))
    })

    const [moveUrl, moveInit] = fetchMock.mock.calls[3]
    expect(moveUrl).toBe('https://APPID.algolia.net/1/indexes/posts_reindex_12345/operation')
    expect(moveInit.method).toBe('POST')
    expect(JSON.parse(moveInit.body)).toEqual({ operation: 'move', destination: 'posts' })
  })

  it('replaceAllRecords splits into batches of 1000 before the move', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider({ ...options, now: () => 1 })
    const records = Array.from({ length: 1500 }, (_, i) => makeRecord(String(i)))

    await provider.replaceAllRecords(records)

    // Existing configuration copy + required settings + 2 batches + 1 move
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).requests).toHaveLength(1000)
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).requests).toHaveLength(500)
    expect(fetchMock.mock.calls[4][0]).toBe('https://APPID.algolia.net/1/indexes/posts_reindex_1/operation')
  })

  it('truncates an oversized UTF-8 body to Algolia-safe record bytes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider(options)
    const record = { ...makeRecord('large'), body: '中文🙂\\quoted\n'.repeat(2_000) }

    await provider.indexRecord(record)

    const indexed = JSON.parse(fetchMock.mock.calls[0][1].body) as SearchRecord
    expect(new TextEncoder().encode(JSON.stringify(indexed)).byteLength).toBeLessThanOrEqual(9_500)
    expect(indexed.body.length).toBeLessThan(record.body.length)
    expect(record.body.startsWith(indexed.body)).toBe(true)
    expect(indexed.body).not.toContain('\uFFFD')
  })

  it('drops only excess trailing tags when metadata alone exceeds the record budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider({ ...options, now: () => 5 })
    const tags = Array.from({ length: 50 }, (_, index) => ({
      slug: `${index}-${'s'.repeat(200)}`,
      name: `${index}-${'标'.repeat(100)}`
    }))
    const record = { ...makeRecord('tag-heavy'), tags, body: 'search body' }

    await provider.replaceAllRecords([record])

    const batch = JSON.parse(fetchMock.mock.calls[2][1].body) as {
      requests: { body: SearchRecord }[]
    }
    const indexed = batch.requests[0]!.body
    expect(new TextEncoder().encode(JSON.stringify(indexed)).byteLength).toBeLessThanOrEqual(9_500)
    expect(indexed.tags.length).toBeLessThan(tags.length)
    expect(indexed.tags).toEqual(tags.slice(0, indexed.tags.length))
    expect(indexed.title).toBe(record.title)
    expect(indexed.slug).toBe(record.slug)
  })

  it('replaceAllRecords with no records atomically moves an empty configured temp index', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider({ ...options, now: () => 99 })

    await provider.replaceAllRecords([])

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe('https://APPID.algolia.net/1/indexes/posts_reindex_99/settings')
    expect(fetchMock.mock.calls[2][0]).toBe('https://APPID.algolia.net/1/indexes/posts_reindex_99/operation')
  })

  it('creates a configured temp index when the live index does not exist yet', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errorResponse(404, 'missing live index'))
      .mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider({ ...options, now: () => 100 })

    await expect(provider.replaceAllRecords([makeRecord('1')])).resolves.toBeUndefined()

    expect(fetchMock.mock.calls[1][0]).toContain('posts_reindex_100/settings')
    expect(fetchMock.mock.calls[2][0]).toContain('posts_reindex_100/batch')
    expect(fetchMock.mock.calls[3][0]).toContain('posts_reindex_100/operation')
  })

  it('does not poll accepted Algolia tasks for a direct write', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(200, { taskID: 1 }))
      .mockResolvedValueOnce(okResponse(200, { status: 'published' }))
      .mockResolvedValueOnce(okResponse(200, { taskID: 2 }))
      .mockResolvedValueOnce(okResponse(200, { status: 'published' }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider(options)

    await provider.indexRecord(makeRecord('1'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/1/indexes/posts/1')
  })

  it('deletes the temp index when a rebuild batch fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse()) // copy
      .mockResolvedValueOnce(okResponse()) // settings
      .mockResolvedValueOnce(errorResponse(500, 'boom')) // batch fails
      .mockResolvedValue(okResponse()) // cleanup delete
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider({ ...options, now: () => 7 })

    await expect(provider.replaceAllRecords([makeRecord('1')])).rejects.toThrow(/500/)

    const [cleanupUrl, cleanupInit] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
    expect(cleanupUrl).toBe('https://APPID.algolia.net/1/indexes/posts_reindex_7')
    expect(cleanupInit.method).toBe('DELETE')
  })

  it('URL-encodes an index name that contains special characters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider({ ...options, indexName: 'my posts' })

    await provider.indexRecord(makeRecord('1'))

    expect(fetchMock.mock.calls[0][0]).toBe('https://APPID.algolia.net/1/indexes/my%20posts/1')
  })

  it('throws with status and response body on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(403, 'forbidden'))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const provider = createAlgoliaSearchProvider(options)

    await expect(provider.indexRecord(makeRecord('1'))).rejects.toThrow(/403/)
    await expect(provider.indexRecord(makeRecord('1'))).rejects.toThrow(/forbidden/)
  })

  it('rejects an admin key entered as the public search-only key without contacting Algolia', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(checkAlgoliaSearchReadiness({
      appId: 'APPID', adminKey: 'same-key', searchOnlyKey: 'same-key', indexName: 'posts'
    })).resolves.toMatchObject({ ready: false, status: 'misconfigured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verifies search-only ACLs and performs a real public query', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(200, { acl: ['search'], indexes: ['posts*'] }))
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse(200, {
        searchableAttributes: ['title', 'excerpt', 'body', 'category.name', 'tags.name'],
        unretrievableAttributes: ['body']
      }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(checkAlgoliaSearchReadiness({
      appId: 'APPID', adminKey: 'admin', searchOnlyKey: 'public', indexName: 'posts'
    })).resolves.toEqual({ ready: true, status: 'configured' })
    expect(fetchMock.mock.calls[0][0]).toContain('/1/keys/public')
    expect(fetchMock.mock.calls[1][0]).toContain('/1/indexes/posts/query')
    expect(fetchMock.mock.calls[1][1].headers['X-Algolia-API-Key']).toBe('public')
    expect(fetchMock.mock.calls[2][0]).toContain('/1/indexes/posts/settings')
  })

  it('rejects public keys with write ACLs or the wrong index restriction', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      okResponse(200, { acl: ['search', 'addObject'], indexes: ['other'] })
    ) as unknown as typeof fetch

    await expect(checkAlgoliaSearchReadiness({
      appId: 'APPID', adminKey: 'admin', searchOnlyKey: 'public', indexName: 'posts'
    })).resolves.toMatchObject({ ready: false, status: 'misconfigured' })
  })

  it('requires an initial rebuild before enabling a missing target index', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(okResponse(200, { acl: ['search'] }))
      .mockResolvedValueOnce(errorResponse(404, 'missing')) as unknown as typeof fetch

    await expect(checkAlgoliaSearchReadiness({
      appId: 'APPID', adminKey: 'admin', searchOnlyKey: 'public', indexName: 'posts'
    })).resolves.toMatchObject({ ready: false, status: 'misconfigured' })
  })

  it('rejects an index that would let the public key retrieve the full body', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(okResponse(200, { acl: ['search'] }))
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse(200, {
        searchableAttributes: ['title', 'body'],
        unretrievableAttributes: []
      })) as unknown as typeof fetch

    await expect(checkAlgoliaSearchReadiness({
      appId: 'APPID', adminKey: 'admin', searchOnlyKey: 'public', indexName: 'posts'
    })).resolves.toMatchObject({ ready: false, status: 'misconfigured' })
  })

  it('requires the configured searchable attribute priority order', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(okResponse(200, { acl: ['search'] }))
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse(200, {
        searchableAttributes: ['body', 'title', 'excerpt', 'category.name', 'tags.name'],
        unretrievableAttributes: ['body']
      })) as unknown as typeof fetch

    await expect(checkAlgoliaSearchReadiness({
      appId: 'APPID', adminKey: 'admin', searchOnlyKey: 'public', indexName: 'posts'
    })).resolves.toMatchObject({ ready: false, status: 'misconfigured' })
  })
})
