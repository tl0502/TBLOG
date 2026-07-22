import { readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../domain/domain-error'
import { createAdminPostServiceForEvent } from '../../../../services/admin-post-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { previewInputSchema } from '../../../../validation/admin-post-input'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)
    const { markdown } = previewInputSchema.parse(await readBody(event))
    const result = await createAdminPostServiceForEvent(event).previewMarkdown(markdown)

    return ok(result)
  } catch (error) {
    const mapped = error instanceof ZodError
      ? new DomainError('validation_failed', 'Invalid preview input', 400, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
