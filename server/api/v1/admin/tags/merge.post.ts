import { readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../domain/domain-error'
import { createAdminTaxonomyServiceForEvent } from '../../../../services/admin-taxonomy-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { mergeTagsInputSchema } from '../../../../validation/admin-taxonomy-input'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)
    const { sourceId, targetId } = mergeTagsInputSchema.parse(await readBody(event))
    await createAdminTaxonomyServiceForEvent(event).mergeTags(sourceId, targetId)

    return ok({ sourceId, targetId })
  } catch (error) {
    const mapped = error instanceof ZodError
      ? new DomainError('validation_failed', 'Invalid merge input', 400, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
