import { readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { authError } from '../../../../../domain/auth-errors'
import { createAdminSecurityServiceForEvent } from '../../../../../services/admin-security-service-factory'
import { errorResponse, ok } from '../../../../../utils/api-response'
import { requireAdmin } from '../../../../../utils/require-admin'
import { enableTwoFactorSchema } from '../../../../../validation/admin-security-input'

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    const input = enableTwoFactorSchema.parse(await readBody(event))
    return ok(await createAdminSecurityServiceForEvent(event).enableTwoFactor(current, input.code))
  } catch (error) {
    const mapped = error instanceof ZodError
      ? authError('validation_failed', 'Invalid two-factor confirmation', 422, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
