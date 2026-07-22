import { authError } from '../../../server/domain/auth-errors'
import { errorResponse, ok } from '../../../server/utils/api-response'
import { sessionCookieName, sessionTtlSeconds } from '../../../server/utils/session-cookie'

describe('auth API contract helpers', () => {
  it('returns the standard success response shape', () => {
    expect(ok({ required: true })).toEqual({
      data: { required: true },
      meta: {}
    })
  })

  it('maps domain errors into the standard error response shape', () => {
    const event = {
      node: {
        req: {
          headers: {}
        }
      }
    }

    expect(errorResponse(event as never, authError('unauthorized', 'Authentication is required', 401)))
      .toMatchObject({
        statusCode: 401,
        body: {
          error: {
            code: 'unauthorized',
            message: 'Authentication is required',
            details: {},
            requestId: expect.any(String)
          }
        }
      })
  })

  it('keeps the session cookie contract stable', () => {
    expect(sessionCookieName).toBe('tblog_session')
    expect(sessionTtlSeconds).toBe(604800)
  })
})
