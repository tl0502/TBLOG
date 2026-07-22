import { readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { authError } from '../../../../domain/auth-errors'
import { createAdminSecurityServiceForEvent } from '../../../../services/admin-security-service-factory'
import { resolveAdminRequestIp } from '../../../../utils/admin-request-ip'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { replaceAdminIpRulesSchema } from '../../../../validation/admin-security-input'

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    const input = replaceAdminIpRulesSchema.parse(await readBody(event))
    return ok(await createAdminSecurityServiceForEvent(event).replaceIpRules(
      current,
      resolveAdminRequestIp(event),
      input
    ))
  } catch (error) {
    const mapped = error instanceof ZodError
      ? authError('validation_failed', 'Invalid IP rule input', 422, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
