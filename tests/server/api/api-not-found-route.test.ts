import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

import route from '../../../server/api/[...]'

type Handler = (event: unknown) => unknown

describe('API catch-all route', () => {
  it('returns a JSON 404 for an unknown API path', () => {
    const event = {
      node: {
        req: { method: 'GET', url: '/api/v1/admin/setup/migration', headers: {} },
        res: { statusCode: 200, setHeader: vi.fn() }
      }
    }

    const body = (route as Handler)(event) as { error: { code: string; message: string } }

    expect(event.node.res.statusCode).toBe(404)
    expect(body.error).toMatchObject({
      code: 'api_not_found',
      message: 'API route not found'
    })
  })
})
