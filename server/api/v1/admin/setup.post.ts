import { readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { authError } from '../../../domain/auth-errors'
import { DomainError } from '../../../domain/domain-error'
import { createAuthServiceForEvent } from '../../../services/auth-service-factory'
import { createDbMigrationServiceForEvent } from '../../../services/db-migration-service-factory'
import { assertAdminRequestOrigin } from '../../../utils/admin-request-origin'
import { errorResponse, ok } from '../../../utils/api-response'
import { setSessionCookie } from '../../../utils/session-cookie'
import { setupAdminInputSchema } from '../../../validation/auth-input'

export default defineEventHandler(async (event) => {
  try {
    assertAdminRequestOrigin(event)
    const input = setupAdminInputSchema.parse(await readBody(event))
    const migrationStatus = await createDbMigrationServiceForEvent(event).getStatus()
    if (migrationStatus.pendingCount > 0) {
      throw new DomainError(
        'database_update_required',
        'Database migrations are pending; complete database setup before creating the administrator',
        409,
        { pending: migrationStatus.pending }
      )
    }
    const result = await createAuthServiceForEvent(event).setupAdministrator(input)
    setSessionCookie(event, result.sessionToken)

    return ok({ admin: result.administrator })
  } catch (error) {
    const mappedError = error instanceof ZodError
      ? authError('validation_failed', 'Invalid setup input', 400, { issues: error.issues })
      : error
    const response = errorResponse(event, mappedError)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
