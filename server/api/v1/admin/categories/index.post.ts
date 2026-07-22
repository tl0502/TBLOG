import { readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../domain/domain-error'
import { createAdminTaxonomyServiceForEvent } from '../../../../services/admin-taxonomy-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { createCategoryInputSchema } from '../../../../validation/admin-taxonomy-input'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)
    const input = createCategoryInputSchema.parse(await readBody(event))
    const category = await createAdminTaxonomyServiceForEvent(event).createCategory(input)

    setResponseStatus(event, 201)
    return ok(category)
  } catch (error) {
    const mapped = error instanceof ZodError
      ? new DomainError('validation_failed', 'Invalid category input', 400, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
