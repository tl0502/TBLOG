import { setResponseStatus } from 'h3'
import { createTaxonomyReadServiceForEvent } from '../../../services/public-read-service-factory'
import { errorResponse, ok } from '../../../utils/api-response'
import { setPublicNoStoreHeaders } from '../../../utils/public-cache'

export default defineEventHandler(async (event) => {
  try {
    const tags = await createTaxonomyReadServiceForEvent(event).getTags()
    setPublicNoStoreHeaders(event)
    return ok(tags)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
