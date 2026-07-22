import { getRouterParam, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { publicReadError } from '../../../domain/public-read-errors'
import { createPublicContentServiceForEvent } from '../../../services/public-read-service-factory'
import { errorResponse, ok } from '../../../utils/api-response'
import { setPublicNoStoreHeaders } from '../../../utils/public-cache'
import { slugParamSchema } from '../../../validation/public-read-input'

export default defineEventHandler(async (event) => {
  try {
    const slug = slugParamSchema.parse(getRouterParam(event, 'slug'))
    const detail = await createPublicContentServiceForEvent(event).getPostDetail(slug)
    setPublicNoStoreHeaders(event)
    return ok(detail)
  } catch (error) {
    const mapped = error instanceof ZodError ? publicReadError('not_found', 'Post not found', 404) : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
