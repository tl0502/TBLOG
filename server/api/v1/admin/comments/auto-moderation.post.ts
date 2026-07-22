import { isError, readBody, setResponseHeader, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../domain/domain-error'
import { createCommentServiceForEvent } from '../../../../services/comment-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { autoModerateCommentsInputSchema } from '../../../../validation/comment-input'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  try {
    const current = await requireAdmin(event)
    let input
    try {
      input = autoModerateCommentsInputSchema.parse(await readBody(event))
    } catch (error) {
      if (error instanceof ZodError || (isError(error) && error.statusCode === 400)) {
        throw new DomainError(
          'validation_failed',
          'Invalid automatic moderation input',
          422,
          error instanceof ZodError ? { issues: error.issues } : {}
        )
      }
      throw error
    }

    return ok(await (await createCommentServiceForEvent(event)).autoModerate(input.ids, current.permissions))
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
