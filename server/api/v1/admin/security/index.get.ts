import { setResponseStatus } from 'h3'
import { createAdminSecurityServiceForEvent } from '../../../../services/admin-security-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { resolveAdminRequestIp } from '../../../../utils/admin-request-ip'
import { requireAdmin } from '../../../../utils/require-admin'

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    return ok(await createAdminSecurityServiceForEvent(event).getOverview(
      current,
      resolveAdminRequestIp(event)
    ))
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
