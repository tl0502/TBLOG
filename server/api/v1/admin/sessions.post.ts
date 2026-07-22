import { readBody, setResponseHeader, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { authError } from '../../../domain/auth-errors'
import { createAuthServiceForEvent } from '../../../services/auth-service-factory'
import { resolveAdminRequestIp } from '../../../utils/admin-request-ip'
import { assertAdminRequestOrigin } from '../../../utils/admin-request-origin'
import { errorResponse, ok } from '../../../utils/api-response'
import { setSessionCookie } from '../../../utils/session-cookie'
import { loginInputSchema } from '../../../validation/auth-input'

export default defineEventHandler(async (event) => {
  try {
    assertAdminRequestOrigin(event)
    const input = loginInputSchema.parse(await readBody(event))
    const result = await createAuthServiceForEvent(event).login(input, {
      ipAddress: resolveAdminRequestIp(event)
    })
    setSessionCookie(event, result.sessionToken)

    return ok({ admin: result.administrator })
  } catch (error) {
    const retryAfter = (error as { code?: string; details?: { retryAfterSeconds?: unknown } })
    if (retryAfter.code === 'login_rate_limited' && typeof retryAfter.details?.retryAfterSeconds === 'number') {
      setResponseHeader(event, 'Retry-After', retryAfter.details.retryAfterSeconds)
    }
    const mappedError = error instanceof ZodError
      ? authError('validation_failed', 'Invalid login input', 400, { issues: error.issues })
      : error
    const response = errorResponse(event, mappedError)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
