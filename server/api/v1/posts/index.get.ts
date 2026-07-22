import { getQuery, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { publicReadError } from '../../../domain/public-read-errors'
import { createPublicContentServiceForEvent } from '../../../services/public-read-service-factory'
import { errorResponse, ok } from '../../../utils/api-response'
import { setPublicNoStoreHeaders } from '../../../utils/public-cache'
import { homeFeedQuerySchema } from '../../../validation/public-read-input'

export default defineEventHandler(async (event) => {
  try {
    const query = homeFeedQuerySchema.parse(getQuery(event))
    const page = await createPublicContentServiceForEvent(event).getHomeFeed(query)
    setPublicNoStoreHeaders(event)
    const { items, ...meta } = page
    return ok(items, meta)
  } catch (error) {
    const mapped =
      error instanceof ZodError
        ? publicReadError('invalid_pagination', 'Invalid pagination query', 400, { issues: error.issues })
        : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
