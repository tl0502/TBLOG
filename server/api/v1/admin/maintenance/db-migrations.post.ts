import { setResponseStatus } from 'h3'
import { createDbMigrationServiceForEvent } from '../../../../services/db-migration-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)
    return ok(await createDbMigrationServiceForEvent(event).applyPending())
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
