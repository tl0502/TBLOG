import { getQuery, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { authError } from '../../../../domain/auth-errors'
import { createAdminSecurityServiceForEvent } from '../../../../services/admin-security-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { loginAttemptQuerySchema } from '../../../../validation/admin-security-input'

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    const query = loginAttemptQuerySchema.parse(getQuery(event))
    const page = await createAdminSecurityServiceForEvent(event).listLoginAttempts(current, query)
    return ok(page.items, { total: page.total, offset: query.offset, limit: query.limit })
  } catch (error) {
    const mapped = error instanceof ZodError
      ? authError('validation_failed', 'Invalid login-attempt query', 422, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
