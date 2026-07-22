import { setResponseStatus } from 'h3'
import { createAuthServiceForEvent } from '../../../../services/auth-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { clearSessionCookie, getSessionCookie } from '../../../../utils/session-cookie'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)
    await createAuthServiceForEvent(event).logout(getSessionCookie(event))
    clearSessionCookie(event)

    return ok({ loggedOut: true })
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
