import { setResponseStatus } from 'h3'
import { createAuthServiceForEvent } from '../../../../services/auth-service-factory'
import { createDbMigrationServiceForEvent } from '../../../../services/db-migration-service-factory'
import { DomainError } from '../../../../domain/domain-error'
import { errorResponse, ok } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  try {
    const service = createDbMigrationServiceForEvent(event)
    const uninitialized = (await service.isDatabaseUninitialized())
      || (await createAuthServiceForEvent(event).getSetupStatus()).required
    if (!uninitialized) {
      throw new DomainError('setup_completed', 'Administrator setup is complete; use the admin migration endpoint', 409)
    }
    const result = await service.applySetupBatch()
    if (result.failed) {
      throw new DomainError(
        'migration_failed',
        'Database migration batch failed',
        500,
        { migrations: result.failed.migrations }
      )
    }
    return ok(result)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
