import { readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../domain/domain-error'
import { createAdminPostServiceForEvent } from '../../../../services/admin-post-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { createPostInputSchema } from '../../../../validation/admin-post-input'

export default defineEventHandler(async (event) => {
  try {
    // Auth first, then validate — an unauthenticated request never reaches the body parse.
    const current = await requireAdmin(event)
    const input = createPostInputSchema.parse(await readBody(event))
    const result = await createAdminPostServiceForEvent(event).create({
      ...input,
      authorId: current.administrator.id
    })

    setResponseStatus(event, 201)
    return ok(result)
  } catch (error) {
    const mapped = error instanceof ZodError
      ? new DomainError('validation_failed', 'Invalid post input', 400, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
