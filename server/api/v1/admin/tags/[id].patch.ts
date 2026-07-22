import { getRouterParam, readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../domain/domain-error'
import { createAdminTaxonomyServiceForEvent } from '../../../../services/admin-taxonomy-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { taxonomyIdParamSchema, updateTagInputSchema } from '../../../../validation/admin-taxonomy-input'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)
    const id = taxonomyIdParamSchema.parse(getRouterParam(event, 'id'))
    const input = updateTagInputSchema.parse(await readBody(event))
    const tag = await createAdminTaxonomyServiceForEvent(event).updateTag(id, input)

    return ok(tag)
  } catch (error) {
    const mapped = error instanceof ZodError
      ? new DomainError('validation_failed', 'Invalid tag input', 400, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
