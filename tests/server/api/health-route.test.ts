import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainError } from '../../../server/domain/domain-error'
import { createHealthServiceForEvent } from '../../../server/services/health-service-factory'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('../../../server/services/health-service-factory', () => ({
  createHealthServiceForEvent: vi.fn()
}))

import route from '../../../server/api/v1/health.get'

type Handler = (event: unknown) => Promise<unknown>

function event() {
  const headers: Record<string, string> = {}
  return {
    value: {
      node: {
        req: { headers: {}, method: 'GET', url: '/api/v1/health' },
        res: {
          statusCode: 200,
          setHeader: (key: string, value: string) => { headers[key] = value }
        }
      },
      context: {}
    },
    headers
  }
}

describe('health route', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 200 only after D1 readiness succeeds', async () => {
    vi.mocked(createHealthServiceForEvent).mockReturnValue({
      checkReadiness: vi.fn().mockResolvedValue({ status: 'ok' })
    } as never)
    const request = event()

    await expect((route as Handler)(request.value)).resolves.toEqual({
      data: { status: 'ok' },
      meta: {}
    })
    expect(request.value.node.res.statusCode).toBe(200)
    expect(request.headers['Cache-Control']).toBe('no-store')
  })

  it('returns the standard safe 503 envelope when D1 is unavailable', async () => {
    vi.mocked(createHealthServiceForEvent).mockReturnValue({
      checkReadiness: vi.fn().mockRejectedValue(
        new DomainError('service_unavailable', 'Service unavailable', 503)
      )
    } as never)
    const request = event()

    const response = await (route as Handler)(request.value)

    expect(request.value.node.res.statusCode).toBe(503)
    expect(response).toMatchObject({
      error: {
        code: 'service_unavailable',
        message: 'Service unavailable',
        details: {},
        requestId: expect.any(String)
      }
    })
    expect(JSON.stringify(response)).not.toContain('D1')
  })
})
