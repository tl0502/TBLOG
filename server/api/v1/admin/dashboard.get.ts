import { setResponseStatus } from 'h3'
import { createAdminDashboardServiceForEvent } from '../../../services/admin-read-service-factory'
import { errorResponse, ok } from '../../../utils/api-response'
import { requireAdmin } from '../../../utils/require-admin'

export default defineEventHandler(async (event) => {
  try {
    // Admin-only: shared guard throws 401 when the session is absent/invalid.
    await requireAdmin(event)
    const metrics = await createAdminDashboardServiceForEvent(event).getDashboardMetrics()

    return ok(metrics)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
