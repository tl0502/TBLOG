import { setResponseStatus } from 'h3'
import { createAnalyticsReportServiceForEvent } from '../../../../../services/analytics-report-service-factory'
import { errorResponse, ok } from '../../../../../utils/api-response'
import { requireAdmin } from '../../../../../utils/require-admin'

export default defineEventHandler(async (event) => {
  try {
    const admin = await requireAdmin(event)
    return ok(await createAnalyticsReportServiceForEvent(event).getStatus(admin.permissions))
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
