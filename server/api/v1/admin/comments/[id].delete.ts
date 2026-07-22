import { getRouterParam, setResponseStatus } from 'h3'
import { commentError } from '../../../../domain/comment-errors'
import { createCommentServiceForEvent } from '../../../../services/comment-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { commentIdParamSchema } from '../../../../validation/comment-input'

function parseCommentId(value: string | undefined): string {
  try {
    return commentIdParamSchema.parse(value)
  } catch {
    throw commentError('comment_not_found', 'Comment not found', 404)
  }
}

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    const id = parseCommentId(getRouterParam(event, 'id'))
    return ok(await (await createCommentServiceForEvent(event)).remove(id, current.permissions))
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
