import { setResponseStatus } from 'h3'
import { createAdminPostServiceForEvent } from '../../../../services/admin-post-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'

export default defineEventHandler(async (event) => {
  try {
    // Admin-only: shared guard throws 401 when the session is absent/invalid.
    await requireAdmin(event)
    const posts = await createAdminPostServiceForEvent(event).list()

    return ok(posts)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
