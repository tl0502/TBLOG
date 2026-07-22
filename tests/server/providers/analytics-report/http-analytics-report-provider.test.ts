import { describe, expect, it, vi } from 'vitest'
import { MAX_ANALYTICS_REPORT_BYTES } from '../../../../server/domain/analytics-report'
import { createHttpAnalyticsReportProvider } from '../../../../server/providers/analytics-report/http-analytics-report-provider'

function source() {
  return {
    schemaVersion: 1,
    revision: 'rev-1',
    generatedAt: '2026-07-19T00:00:00.000Z',
    syncedThrough: '2026-07-18',
    articles: [{ path: '/posts/a', pageViews: 12 }],
    currentHotspots: [],
    historicalHotspots: []
  }
}

describe('HTTP analytics report provider', () => {
  it('uses a bounded authenticated server-side request without following redirects', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(source()), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))
    const provider = createHttpAnalyticsReportProvider({
      providerKey: 'report',
      endpoint: 'https://analytics.example.com/report?existing=1',
      siteId: 'blog id',
      token: 'secret-token',
      fetchImpl
    })

    await expect(provider.fetchReport()).resolves.toMatchObject({ revision: 'rev-1' })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toContain('existing=1')
    expect(String(url)).toContain('siteId=blog+id')
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' })
    expect(init.headers).toMatchObject({ authorization: 'Bearer secret-token', accept: 'application/json' })
  })

  it('rejects non-success, invalid schema, and declared oversized responses', async () => {
    const responses = [
      new Response('{}', { status: 502 }),
      new Response(JSON.stringify({ ...source(), articles: [{ path: '/admin', pageViews: 1 }] })),
      new Response('{}', { headers: { 'content-length': String(MAX_ANALYTICS_REPORT_BYTES + 1) } })
    ]
    for (const response of responses) {
      const provider = createHttpAnalyticsReportProvider({
        providerKey: 'report', endpoint: 'https://analytics.example.com/report', token: 'token',
        fetchImpl: vi.fn().mockResolvedValue(response)
      })
      await expect(provider.fetchReport()).rejects.toMatchObject({ name: 'AnalyticsReportProviderError' })
    }
  })
})
