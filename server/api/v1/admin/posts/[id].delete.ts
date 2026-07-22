import { getRouterParam, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { adminPostError } from '../../../../domain/admin-post-errors'
import { createAdminPostServiceForEvent } from '../../../../services/admin-post-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { postIdParamSchema } from '../../../../validation/admin-post-input'

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event)
    const id = postIdParamSchema.parse(getRouterParam(event, 'id'))
    await createAdminPostServiceForEvent(event).delete(id)

    return ok({ id })
  } catch (error) {
    const mapped = error instanceof ZodError ? adminPostError('not_found', 'Post not found', 404) : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
