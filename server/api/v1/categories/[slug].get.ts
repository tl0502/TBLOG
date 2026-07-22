import { getQuery, getRouterParam, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { publicReadError } from '../../../domain/public-read-errors'
import { createTaxonomyReadServiceForEvent } from '../../../services/public-read-service-factory'
import { errorResponse, ok } from '../../../utils/api-response'
import { setPublicNoStoreHeaders } from '../../../utils/public-cache'
import { paginationQuerySchema, slugParamSchema } from '../../../validation/public-read-input'

export default defineEventHandler(async (event) => {
  try {
    const slug = slugParamSchema.parse(getRouterParam(event, 'slug'))
    const query = paginationQuerySchema.parse(getQuery(event))
    const detail = await createTaxonomyReadServiceForEvent(event).getCategoryDetail(slug, query)
    setPublicNoStoreHeaders(event)
    return ok({ category: detail.category, items: detail.articles.items }, { nextCursor: detail.articles.nextCursor })
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
