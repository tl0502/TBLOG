import { setResponseStatus } from 'h3'
import { createHomeRailServiceForEvent } from '../../../services/home-rail-service-factory'
import { errorResponse, ok } from '../../../utils/api-response'
import { setPublicNoStoreHeaders } from '../../../utils/public-cache'

export default defineEventHandler(async (event) => {
  try {
    const data = await createHomeRailServiceForEvent(event).getPublicData()
    // Dynamic rail data is not response-cached; optional provider caching remains resource-oriented.
    setPublicNoStoreHeaders(event)
    return ok(data)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
