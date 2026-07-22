import { setResponseStatus } from 'h3'
import { createAdminTaxonomyServiceForEvent } from '../../../../services/admin-taxonomy-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)
    const tags = await createAdminTaxonomyServiceForEvent(event).listTags()

    return ok(tags)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
