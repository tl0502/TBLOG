import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeoFeedServiceForEvent } from '../../../server/services/seo-feed-service-factory'

// Nitro auto-imports `defineEventHandler`; shim it so the route modules export the bare handler.
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('../../../server/services/seo-feed-service-factory', () => ({
  createSeoFeedServiceForEvent: vi.fn()
}))

import rssRoute from '../../../server/routes/rss.xml.get'
import sitemapRoute from '../../../server/routes/sitemap.xml.get'
import robotsRoute from '../../../server/routes/robots.txt.get'

type Handler = (event: unknown) => Promise<unknown>

function makeEvent() {
  const headers: Record<string, string> = {}
  const event = {
    node: {
      req: { headers: {} as Record<string, string> },
      res: { statusCode: 200, setHeader: (key: string, value: string) => { headers[key] = value } }
    },
    context: {}
  }
  return { event, headers }
}

function service(impl: Record<string, unknown>) {
  vi.mocked(createSeoFeedServiceForEvent).mockReturnValue(impl as never)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('seo feed routes', () => {
  it('serves RSS XML with an application/xml content type and no response caching', async () => {
    service({ getRssFeed: vi.fn().mockResolvedValue({ xml: '<rss/>' }) })
    const { event, headers } = makeEvent()

    const body = await (rssRoute as Handler)(event)

    expect(body).toBe('<rss/>')
    expect(headers['Content-Type']).toBe('application/xml; charset=utf-8')
    expect(headers['Cache-Control']).toBe('no-store')
    expect(event.node.res.statusCode).toBe(200)
  })

  it('returns a 404 text body when RSS is disabled', async () => {
    service({ getRssFeed: vi.fn().mockResolvedValue(null) })
    const { event, headers } = makeEvent()

    const body = await (rssRoute as Handler)(event)

    expect(event.node.res.statusCode).toBe(404)
    expect(headers['Content-Type']).toBe('text/plain; charset=utf-8')
    expect(String(body)).toContain('disabled')
    expect(headers['Cache-Control']).toBeUndefined()
  })

  it('serves sitemap XML and 404s when disabled', async () => {
    service({ getSitemap: vi.fn().mockResolvedValue({ xml: '<urlset/>' }) })
    const first = makeEvent()
    expect(await (sitemapRoute as Handler)(first.event)).toBe('<urlset/>')
    expect(first.headers['Content-Type']).toBe('application/xml; charset=utf-8')

    service({ getSitemap: vi.fn().mockResolvedValue(null) })
    const second = makeEvent()
    await (sitemapRoute as Handler)(second.event)
    expect(second.event.node.res.statusCode).toBe(404)
  })

  it('always serves robots.txt as plain text', async () => {
    service({ getRobotsTxt: vi.fn().mockResolvedValue({ text: 'User-agent: *\nDisallow:\n' }) })
    const { event, headers } = makeEvent()

    const body = await (robotsRoute as Handler)(event)

    expect(body).toContain('User-agent: *')
    expect(headers['Content-Type']).toBe('text/plain; charset=utf-8')
    expect(headers['Cache-Control']).toBe('no-store')
  })
})
