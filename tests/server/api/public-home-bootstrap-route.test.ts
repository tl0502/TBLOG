import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getQuery } from 'h3'
import { createPublicHomeBootstrapServiceForEvent } from '../../../server/services/public-home-bootstrap-service-factory'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return { ...actual, getQuery: vi.fn() }
})

vi.mock('../../../server/services/public-home-bootstrap-service-factory', () => ({
  createPublicHomeBootstrapServiceForEvent: vi.fn()
}))

import route from '../../../server/api/v1/home.get'

type Handler = (event: unknown) => Promise<unknown>

function makeEvent() {
  const headers: Record<string, string> = {}
  const event = {
    node: {
      req: { headers: {} as Record<string, string> },
      res: {
        statusCode: 200,
        setHeader: (key: string, value: string) => { headers[key] = value }
      }
    },
    context: {}
  }
  return { event, headers }
}

describe('public home bootstrap route', () => {
  beforeEach(() => vi.resetAllMocks())

  it('validates defaults and returns the standard public envelope without response caching', async () => {
    vi.mocked(getQuery).mockReturnValue({})
    const value = {
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
    }
    const getBootstrap = vi.fn().mockResolvedValue({ data: value, degraded: [] })
    vi.mocked(createPublicHomeBootstrapServiceForEvent).mockReturnValue({ getBootstrap } as never)
    const { event, headers } = makeEvent()

    await expect((route as Handler)(event)).resolves.toEqual({ data: value, meta: { degraded: [] } })
    expect(getBootstrap).toHaveBeenCalledWith({
      page: 1, limit: 25, sort: 'publishedAt', order: 'desc'
    })
    expect(headers['Cache-Control']).toBe('no-store')
  })

  it('maps an invalid home-feed query to 400 before constructing the service', async () => {
    vi.mocked(getQuery).mockReturnValue({ sort: 'comments' })
    const { event, headers } = makeEvent()

    const body = await (route as Handler)(event) as { error: { code: string } }

    expect(event.node.res.statusCode).toBe(400)
    expect(body).toMatchObject({ error: { code: 'invalid_pagination' } })
    expect(createPublicHomeBootstrapServiceForEvent).not.toHaveBeenCalled()
    expect(headers['Cache-Control']).toBeUndefined()
  })
})
