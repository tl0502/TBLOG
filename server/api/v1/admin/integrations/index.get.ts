import { setResponseHeader, setResponseStatus } from 'h3'
import { createIntegrationServiceForEvent } from '../../../../services/integration-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    const items = await createIntegrationServiceForEvent(event).list(current.permissions)

    return ok(items, { total: items.length })
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
