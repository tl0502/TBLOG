import { setResponseStatus } from 'h3'
import { createCommentServiceForEvent } from '../../../../services/comment-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    const deleted = await (await createCommentServiceForEvent(event))
      .purgeExpiredModerationResults(current.permissions)
    return ok({ deleted })
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
