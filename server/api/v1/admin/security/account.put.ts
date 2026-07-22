import { readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { authError } from '../../../../domain/auth-errors'
import { createAdminSecurityServiceForEvent } from '../../../../services/admin-security-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { getSessionCookie } from '../../../../utils/session-cookie'
import { updateAdministratorAccountSchema } from '../../../../validation/admin-security-input'

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    const input = updateAdministratorAccountSchema.parse(await readBody(event))
    const sessionToken = getSessionCookie(event)
    if (!sessionToken) throw authError('unauthorized', 'Authentication is required', 401)
    return ok({ administrator: await createAdminSecurityServiceForEvent(event).updateAccount(
      current,
      sessionToken,
      input
    ) })
  } catch (error) {
    const mapped = error instanceof ZodError
      ? authError('validation_failed', 'Invalid account input', 422, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
