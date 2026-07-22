import { getRouterParam, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { adminTaxonomyError } from '../../../../domain/admin-taxonomy-errors'
import { createAdminTaxonomyServiceForEvent } from '../../../../services/admin-taxonomy-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { taxonomyIdParamSchema } from '../../../../validation/admin-taxonomy-input'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)
    const id = taxonomyIdParamSchema.parse(getRouterParam(event, 'id'))
    await createAdminTaxonomyServiceForEvent(event).deleteTag(id)

    return ok({ id })
  } catch (error) {
    const mapped = error instanceof ZodError
      ? adminTaxonomyError('not_found', 'Tag not found', 404)
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
