import { setResponseStatus } from 'h3'
import { createPublicContentServiceForEvent } from '../../../services/public-read-service-factory'
import { errorResponse, ok } from '../../../utils/api-response'
import { setPublicNoStoreHeaders } from '../../../utils/public-cache'

export default defineEventHandler(async (event) => {
  try {
    const featured = await createPublicContentServiceForEvent(event).getFeaturedPosts()
    setPublicNoStoreHeaders(event)
    return ok(featured)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
