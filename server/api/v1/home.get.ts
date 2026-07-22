import { getQuery, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { publicReadError } from '../../domain/public-read-errors'
import { createPublicHomeBootstrapServiceForEvent } from '../../services/public-home-bootstrap-service-factory'
import { errorResponse, ok } from '../../utils/api-response'
import { setPublicNoStoreHeaders } from '../../utils/public-cache'
import { homeFeedQuerySchema } from '../../validation/public-read-input'

export default defineEventHandler(async (event) => {
  try {
    const query = homeFeedQuerySchema.parse(getQuery(event))
    const result = await createPublicHomeBootstrapServiceForEvent(event).getBootstrap(query)
    // Pages does not edge-cache this dynamic JSON response in the baseline deployment. Optional KV
    // resource caches remain authoritative; without KV, each authoritative request falls back to D1.
    setPublicNoStoreHeaders(event)
    return ok(result.data, { degraded: result.degraded })
  } catch (error) {
    const mapped = error instanceof ZodError
      ? publicReadError('invalid_pagination', 'Invalid pagination query', 400, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
