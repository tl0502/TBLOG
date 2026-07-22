import { setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../../domain/domain-error'
import { createAnalyticsReportServiceForEvent } from '../../../../../services/analytics-report-service-factory'
import { errorResponse, ok } from '../../../../../utils/api-response'
import { requireAdmin } from '../../../../../utils/require-admin'
import { analyticsReportSettingsSchema } from '../../../../../validation/analytics-report-input'

export default defineEventHandler(async (event) => {
  try {
    const admin = await requireAdmin(event)
    const input = analyticsReportSettingsSchema.parse(await readBody(event))
    return ok(await createAnalyticsReportServiceForEvent(event).updateSettings(input, admin.permissions))
  } catch (error) {
    const mapped = error instanceof ZodError
      ? new DomainError('validation_failed', 'Invalid analytics report settings', 422, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
