import { setResponseHeader, setResponseStatus } from 'h3'
import { createHealthServiceForEvent } from '../../services/health-service-factory'
import { errorResponse, ok } from '../../utils/api-response'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  try {
    return ok(await createHealthServiceForEvent(event).checkReadiness())
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
