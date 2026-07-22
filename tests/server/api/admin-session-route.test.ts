import { readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthServiceForEvent } from '../../../server/services/auth-service-factory'
import { authError } from '../../../server/domain/auth-errors'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return { ...actual, readBody: vi.fn() }
})
vi.mock('../../../server/services/auth-service-factory', () => ({
  createAuthServiceForEvent: vi.fn()
}))
vi.mock('../../../server/utils/admin-request-ip', () => ({
  resolveAdminRequestIp: vi.fn(() => '192.0.2.1')
}))
vi.mock('../../../server/utils/admin-request-origin', () => ({
  assertAdminRequestOrigin: vi.fn()
}))
vi.mock('../../../server/utils/session-cookie', () => ({
  setSessionCookie: vi.fn()
}))

import route from '../../../server/api/v1/admin/sessions.post'

type Handler = (event: unknown) => Promise<unknown>

function event() {
  return {
    method: 'POST',
    node: {
      req: { method: 'POST', headers: {} },
      res: { statusCode: 200, setHeader: vi.fn() }
    },
    context: {}
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(readBody).mockResolvedValue({ username: 'owner', password: 'wrong-password' })
})

describe('POST /api/v1/admin/sessions', () => {
  it('returns the persistent throttle response with Retry-After', async () => {
    vi.mocked(createAuthServiceForEvent).mockReturnValue({
      login: vi.fn().mockRejectedValue(authError(
        'login_rate_limited',
        'Too many failed login attempts. Try again later',
        429,
        { retryAfterSeconds: 240 }
      ))
    } as never)
    const request = event()
    const result = await (route as Handler)(request) as { error: { code: string } }

    expect(request.node.res.statusCode).toBe(429)
    expect(request.node.res.setHeader).toHaveBeenCalledWith('Retry-After', 240)
    expect(result.error.code).toBe('login_rate_limited')
  })
})
