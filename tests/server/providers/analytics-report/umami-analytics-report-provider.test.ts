import { describe, expect, it, vi } from 'vitest'
import { MAX_ANALYTICS_REPORT_BYTES } from '../../../../server/domain/analytics-report'
import {
  createUmamiAnalyticsReportProvider,
  probeUmamiAnalyticsReport
} from '../../../../server/providers/analytics-report/umami-analytics-report-provider'

const now = new Date('2026-07-19T18:30:00.000Z')

function provider(fetchImpl: typeof fetch, authMode: 'apiKey' | 'bearer' = 'apiKey') {
  return createUmamiAnalyticsReportProvider({
    providerKey: 'umami-report',
    apiBaseUrl: authMode === 'apiKey' ? 'https://api.umami.is/v1' : 'https://umami.example.com/api',
    websiteId: 'website/id',
    token: 'secret-token',
    authMode,
    fetchImpl,
    now: () => now
  })
}

function probe(fetchImpl: typeof fetch, timeoutMs = 10_000) {
  return probeUmamiAnalyticsReport({
    apiBaseUrl: 'https://umami.example.com/api',
    websiteId: 'website/id',
    token: 'secret-token',
    authMode: 'bearer',
    timeoutMs,
    fetchImpl,
    now: () => now
  })
}

describe('Umami analytics report provider', () => {
  it('queries three UTC windows through the refresh time and maps only article paths', async () => {
    const responses = [
      [
        { name: '/posts/old', pageviews: 100, visitors: 10 },
        { name: '/', pageviews: 90, visitors: 80 },
        { name: '/posts/nested/path', pageviews: 30, visitors: 20 },
        { name: '/posts/current', pageviews: 20, visitors: 2 }
      ],
      [
        { name: '/posts/current', pageviews: 12, visitors: 1 },
        { name: '/admin', pageviews: 8, visitors: 8 },
        { name: '/posts/new', pageviews: 4, visitors: 2 }
      ],
      [
        { name: '/posts/current', pageviews: 7, visitors: 1 },
        { name: '/posts/new', pageviews: 9, visitors: 3 }
      ]
    ]
    const fetchImpl = vi.fn().mockImplementation(async () => (
      new Response(JSON.stringify(responses.shift()), { status: 200 })
    ))

    await expect(provider(fetchImpl).fetchReport()).resolves.toMatchObject({
      generatedAt: now.toISOString(),
      syncedThrough: '2026-07-19',
      articles: [
        { path: '/posts/old', pageViews: 100 },
        { path: '/posts/current', pageViews: 20 }
      ],
      currentHotspots: [
        { path: '/posts/current', pageViews: 12, previousPageViews: 7 },
        { path: '/posts/new', pageViews: 4, previousPageViews: 9 }
      ],
      historicalHotspots: [
        { path: '/posts/old', pageViews: 100 },
        { path: '/posts/current', pageViews: 20 }
      ]
    })

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    const urls = fetchImpl.mock.calls.map(([url]) => new URL(String(url)))
    expect(urls.map((url) => [url.searchParams.get('startAt'), url.searchParams.get('endAt')])).toEqual([
      ['1721433600000', '1784485800000'],
      ['1783900800000', '1784485800000'],
      ['1783296000000', '1783900799999']
    ])
    for (const url of urls) {
      expect(url.pathname).toBe('/v1/websites/website%2Fid/metrics/expanded')
      expect(url.searchParams.get('type')).toBe('path')
      expect(url.searchParams.get('search')).toBe('/posts/')
      expect(url.searchParams.get('limit')).toBe('2001')
      expect(url.search).not.toContain('secret-token')
    }
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({ method: 'GET', redirect: 'manual' })
      expect(init?.headers).toMatchObject({ 'x-umami-api-key': 'secret-token' })
      expect(init?.headers).not.toHaveProperty('authorization')
    }
  })

  it('uses Bearer authentication for a self-hosted API base', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response('[]', { status: 200 }))

    await provider(fetchImpl, 'bearer').fetchReport()

    expect(String(fetchImpl.mock.calls[0]![0])).toContain('https://umami.example.com/api/websites/')
    expect(fetchImpl.mock.calls[0]![1]?.headers).toMatchObject({
      authorization: 'Bearer secret-token'
    })
    expect(fetchImpl.mock.calls[0]![1]?.headers).not.toHaveProperty('x-umami-api-key')
  })

  it('accepts numeric-string pageview counts returned by self-hosted Umami', async () => {
    const responses = [
      [{ name: '/posts/current', pageviews: '2' }],
      [{ name: '/posts/current', pageviews: '2' }],
      [{ name: '/posts/current', pageviews: '1' }]
    ]
    const fetchImpl = vi.fn().mockImplementation(async () => (
      new Response(JSON.stringify(responses.shift()), { status: 200 })
    ))

    await expect(provider(fetchImpl, 'bearer').fetchReport()).resolves.toMatchObject({
      articles: [{ path: '/posts/current', pageViews: 2 }],
      currentHotspots: [{ path: '/posts/current', pageViews: 2, previousPageViews: 1 }]
    })
  })

  it('probes one bounded self-hosted metrics request without exposing the token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { name: '/posts/current', pageviews: 1 }
    ]), { status: 200 }))

    await expect(probe(fetchImpl)).resolves.toEqual({ ok: true })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetchImpl.mock.calls[0]![0]))
    expect(url.pathname).toBe('/api/websites/website%2Fid/metrics/expanded')
    expect(Number(url.searchParams.get('endAt')) - Number(url.searchParams.get('startAt')))
      .toBe(86_400_000)
    expect(url.searchParams.get('type')).toBe('path')
    expect(url.searchParams.get('search')).toBe('/posts/')
    expect(url.searchParams.get('limit')).toBe('1')
    expect(url.search).not.toContain('secret-token')
    expect(fetchImpl.mock.calls[0]![1]?.headers).toMatchObject({
      authorization: 'Bearer secret-token'
    })
  })

  it.each([
    [302, 'redirect'],
    [401, 'authentication'],
    [403, 'permission'],
    [404, 'notFound'],
    [429, 'rateLimited'],
    [422, 'incompatible'],
    [503, 'upstream']
  ] as const)('classifies HTTP %s probe failures as %s', async (status, reason) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status }))

    await expect(probe(fetchImpl)).resolves.toEqual({ ok: false, reason, statusCode: status })
  })

  it('classifies invalid responses and network failures without returning upstream details', async () => {
    const invalid = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(probe(invalid)).resolves.toEqual({ ok: false, reason: 'invalidResponse' })

    const network = vi.fn().mockRejectedValue(new TypeError('secret-token upstream detail'))
    await expect(probe(network)).resolves.toEqual({ ok: false, reason: 'network' })
  })

  it('classifies a probe timeout and aborts its only request', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => (
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      ))
      const timed = probe(fetchImpl, 1_000)

      await vi.advanceTimersByTimeAsync(1_000)
      await expect(timed).resolves.toEqual({ ok: false, reason: 'timeout' })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects duplicate paths, invalid counts, excessive rows, and bounded-response failures', async () => {
    const invalidResponses = [
      [{ name: '/posts/a', pageviews: 1 }, { name: '/posts/a', pageviews: 2 }],
      [{ name: '/posts/a', pageviews: -1 }],
      Array.from({ length: 2_001 }, (_, index) => ({ name: `/posts/page-${index}`, pageviews: index }))
    ]
    for (const value of invalidResponses) {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status: 200 }))
      await expect(provider(fetchImpl).fetchReport()).rejects.toMatchObject({
        name: 'AnalyticsReportProviderError'
      })
    }

    const oversized = vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-length': String(MAX_ANALYTICS_REPORT_BYTES + 1) }
    }))
    await expect(provider(oversized).fetchReport()).rejects.toMatchObject({
      name: 'AnalyticsReportProviderError'
    })
  })

  it('aborts all requests when the timeout expires', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => (
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
      ))
      const timed = createUmamiAnalyticsReportProvider({
        providerKey: 'umami-report',
        apiBaseUrl: 'https://api.umami.is/v1',
        websiteId: 'website-id',
        token: 'token',
        timeoutMs: 1_000,
        fetchImpl,
        now: () => now
      }).fetchReport()
      const rejected = expect(timed).rejects.toMatchObject({ name: 'AnalyticsReportProviderError' })

      await vi.advanceTimersByTimeAsync(1_000)
      await rejected
      expect(fetchImpl).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})
