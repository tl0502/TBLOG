import { setResponseStatus } from 'h3'
import { DomainError } from '../domain/domain-error'
import { errorResponse } from '../utils/api-response'

export default defineEventHandler((event) => {
  const response = errorResponse(event, new DomainError(
    'api_not_found',
    'API route not found',
    404
  ))
  setResponseStatus(event, response.statusCode)
  return response.body
})
