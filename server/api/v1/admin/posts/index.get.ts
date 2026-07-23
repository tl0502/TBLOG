import { getQuery, setResponseStatus } from 'h3'
import { createAdminPostServiceForEvent } from '../../../../services/admin-post-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { postListQuerySchema } from '../../../../validation/admin-post-input'

export default defineEventHandler(async (event) => {
  try {
    // Admin-only: shared guard throws 401 when the session is absent/invalid.
    await requireAdmin(event)
    // The schema is resilient (bad params fall back to defaults), so this never throws on query input.
    const query = postListQuerySchema.parse(getQuery(event))
    const page = await createAdminPostServiceForEvent(event).list(query)

    return ok(page.items, { total: page.total, offset: query.offset, limit: query.limit })
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
