import { setResponseStatus } from 'h3'
import { createAuthServiceForEvent } from '../../../../services/auth-service-factory'
import { createDbMigrationServiceForEvent } from '../../../../services/db-migration-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  try {
    // A brand-new empty database has no `administrators` table yet, so setup is required. Short-circuit
    // before querying it so /admin/setup loads cleanly instead of 500-ing on the missing table.
    if (await createDbMigrationServiceForEvent(event).isDatabaseUninitialized()) {
      return ok({ required: true })
    }
    return ok(await createAuthServiceForEvent(event).getSetupStatus())
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
