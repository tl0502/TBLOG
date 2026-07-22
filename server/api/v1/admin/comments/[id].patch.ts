import { getRouterParam, isError, readBody, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { ZodError } from 'zod'
import { commentError } from '../../../../domain/comment-errors'
import { DomainError } from '../../../../domain/domain-error'
import { createCommentServiceForEvent } from '../../../../services/comment-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { commentIdParamSchema, moderateCommentInputSchema } from '../../../../validation/comment-input'

function parseCommentId(value: string | undefined): string {
  try {
    return commentIdParamSchema.parse(value)
  } catch {
    throw commentError('comment_not_found', 'Comment not found', 404)
  }
}

async function parseModerationInput(event: H3Event) {
  try {
    return moderateCommentInputSchema.parse(await readBody(event))
  } catch (error) {
    if (error instanceof ZodError || (isError(error) && error.statusCode === 400)) {
      throw new DomainError(
        'validation_failed',
        'Invalid comment input',
        422,
        error instanceof ZodError ? { issues: error.issues } : {}
      )
    }

    throw error
  }
}

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    const id = parseCommentId(getRouterParam(event, 'id'))
    const input = await parseModerationInput(event)
    const result = await (await createCommentServiceForEvent(event)).moderate(
      id,
      input.status,
      current.permissions
    )

    return ok(result)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
