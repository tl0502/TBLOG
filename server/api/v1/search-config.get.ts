import { setResponseStatus } from 'h3'
import { createIntegrationServiceForEvent } from '../../services/integration-service-factory'
import { errorResponse, ok } from '../../utils/api-response'
import { setPublicNoStoreHeaders } from '../../utils/public-cache'

export default defineEventHandler(async (event) => {
  try {
    const config = await createIntegrationServiceForEvent(event).getPublicSearchConfig()
    setPublicNoStoreHeaders(event)
    return ok(config)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
