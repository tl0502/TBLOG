import { setResponseStatus } from 'h3'
import { errorResponse, ok } from '../../../utils/api-response'
import { requireAdmin } from '../../../utils/require-admin'

export default defineEventHandler(async (event) => {
  try {
    return ok(await requireAdmin(event))
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
