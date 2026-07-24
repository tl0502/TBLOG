import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_ANALYTICS_REPORT_ARTICLES,
  MAX_ANALYTICS_REPORT_BYTES
} from '../../../../server/domain/analytics-report'
import {
  createPlausibleAnalyticsReportProvider,
  probePlausibleAnalyticsReport
} from '../../../../server/providers/analytics-report/plausible-analytics-report-provider'

const NOW = new Date('2026-07-19T12:00:00.000Z')

function response(rows: Array<[string, number]>, totalRows = rows.length) {
  return new Response(JSON.stringify({
    results: rows.map(([path, pageViews]) => ({ dimensions: [path], metrics: [pageViews] })),
    meta: { total_rows: totalRows },
    query: {}
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function provider(fetchImpl: typeof fetch, timeoutMs?: number) {
  return createPlausibleAnalyticsReportProvider({
    providerKey: 'plausible',
    baseUrl: 'https://plausible.example.com',
    siteId: 'blog.example.com',
    apiKey: 'secret-key',
    timeoutMs,
    fetchImpl,
    now: () => NOW
  })
}

describe('Plausible analytics report provider', () => {
  afterEach(() => vi.useRealTimers())

  it('queries complete UTC article page-view totals with explicit v2 datetime ranges', async () => {
    const fetchImpl = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(response([['/posts/b', 7], ['/posts/a', 12]])))
      .mockImplementationOnce(() => Promise.resolve(response([['/posts/b', 5], ['/posts/a', 2]])))
      .mockImplementationOnce(() => Promise.resolve(response([['/posts/a', 4], ['/posts/b', 3]])))

    const report = await provider(fetchImpl).fetchReport()

    expect(report).toMatchObject({
      schemaVersion: 1,
      generatedAt: NOW.toISOString(),
      syncedThrough: '2026-07-18',
      articles: [
        { path: '/posts/a', pageViews: 12 },
        { path: '/posts/b', pageViews: 7 }
      ],
      currentHotspots: [
        { path: '/posts/b', pageViews: 5, previousPageViews: 3 },
        { path: '/posts/a', pageViews: 2, previousPageViews: 4 }
      ],
      historicalHotspots: [
        { path: '/posts/a', pageViews: 12 },
        { path: '/posts/b', pageViews: 7 }
      ]
    })
    expect(report.revision).toMatch(/^plausible:[a-f0-9]{64}$/)

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    const ranges = [
      ['2024-07-19T00:00:00.000Z', '2026-07-18T23:59:59.999Z'],
      ['2026-07-12T00:00:00.000Z', '2026-07-18T23:59:59.999Z'],
      ['2026-07-05T00:00:00.000Z', '2026-07-11T23:59:59.999Z']
    ]
    for (const [index, [url, init]] of fetchImpl.mock.calls.entries()) {
      expect(String(url)).toBe('https://plausible.example.com/api/v2/query')
      expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
      expect(init.headers).toMatchObject({
        accept: 'application/json',
        authorization: 'Bearer secret-key',
        'content-type': 'application/json'
      })
      expect(JSON.parse(String(init.body))).toEqual({
        site_id: 'blog.example.com',
        metrics: ['pageviews'],
        date_range: ranges[index],
        dimensions: ['event:page'],
        filters: [['matches', 'event:page', ['^/posts/[^/]+$']]],
        order_by: [['pageviews', 'desc'], ['event:page', 'asc']],
        include: { total_rows: true },
        pagination: { limit: MAX_ANALYTICS_REPORT_ARTICLES, offset: 0 }
      })
    }
  })

  it.each([
    ['non-success response', () => new Response('{}', { status: 502 })],
    ['too many rows', () => response([], MAX_ANALYTICS_REPORT_ARTICLES + 1)],
    ['incomplete page', () => response([['/posts/a', 1]], 2)],
    ['invalid count', () => response([['/posts/a', -1]])],
    ['invalid article path', () => response([['/posts/a/nested', 1]])],
    ['duplicate article path', () => response([['/posts/a', 2], ['/posts/a', 1]])],
    ['declared oversized response', () => new Response('{}', {
      headers: { 'content-length': String(MAX_ANALYTICS_REPORT_BYTES + 1) }
    })]
  ])('rejects %s without exposing provider details', async (_label, buildResponse) => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(buildResponse()))

    await expect(provider(fetchImpl).fetchReport()).rejects.toMatchObject({
      name: 'AnalyticsReportProviderError',
      message: 'Analytics report provider request failed'
    })
  })

  it('rejects an oversized streamed response without relying on content-length', async () => {
    const bytes = new TextEncoder().encode('x'.repeat(MAX_ANALYTICS_REPORT_BYTES + 1))
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      }
    }))))

    await expect(provider(fetchImpl).fetchReport())
      .rejects.toMatchObject({ name: 'AnalyticsReportProviderError' })
  })

  it('aborts a request at the configured timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as typeof fetch
    const request = provider(fetchImpl, 1_000).fetchReport()
    const rejection = expect(request).rejects.toMatchObject({ name: 'AnalyticsReportProviderError' })

    await vi.advanceTimersByTimeAsync(1_000)

    await rejection
  })

  it('probes readiness with a single one-day, one-row Stats API query', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(response([['/posts/a', 1]])))

    await expect(probePlausibleAnalyticsReport({
      baseUrl: 'https://plausible.example.com',
      siteId: 'blog.example.com',
      apiKey: 'secret-key',
      fetchImpl,
      now: () => NOW
    })).resolves.toEqual({ ok: true })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body))).toMatchObject({
      site_id: 'blog.example.com',
      date_range: ['2026-07-18T00:00:00.000Z', '2026-07-18T23:59:59.999Z'],
      pagination: { limit: 1, offset: 0 }
    })
  })
})
