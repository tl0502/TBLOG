import { getRequestHeader } from 'h3'
import type { H3Event } from 'h3'
import { DomainError } from '../domain/domain-error'

export function ok<TData>(data: TData, meta: Record<string, unknown> = {}) {
  return { data, meta }
}

export function errorResponse(event: H3Event, error: unknown) {
  const requestId = getRequestHeader(event, 'cf-ray') || crypto.randomUUID()

  if (error instanceof DomainError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId
        }
      }
    }
  }

  const request = event.node.req
  const rawUrl = typeof request.url === 'string' ? request.url : '/'
  console.error('[api-unhandled-error]', {
    requestId,
    method: typeof request.method === 'string' ? request.method : 'UNKNOWN',
    path: rawUrl.split('?', 1)[0] || '/',
    errorKind: error instanceof Error ? 'Error' : 'NonError'
  })

  return {
    statusCode: 500,
    body: {
      error: {
        code: 'internal_error',
        message: 'Internal server error',
        details: {},
        requestId
      }
    }
  }
}
