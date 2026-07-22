import { contentError } from '../../../server/domain/content-errors'
import { errorResponse } from '../../../server/utils/api-response'

const event = { node: { req: { headers: {} } } } as never

describe('errorResponse domain mapping', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps content domain errors to their own status code and code', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      errorResponse(
        event,
        contentError('processed_content_required', 'Valid processed content is required before publishing', 409)
      )
    ).toMatchObject({
      statusCode: 409,
      body: {
        error: {
          code: 'processed_content_required',
          message: 'Valid processed content is required before publishing',
          details: {},
          requestId: expect.any(String)
        }
      }
    })
    expect(log).not.toHaveBeenCalled()
  })

  it('falls back to a 500 internal error for non-domain errors', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const requestEvent = {
      node: { req: { headers: { 'cf-ray': 'ray-1' }, method: 'POST', url: '/api/v1/admin/posts?secret=nope' } }
    } as never

    expect(errorResponse(requestEvent, new Error('provider secret must not be logged'))).toMatchObject({
      statusCode: 500,
      body: { error: { code: 'internal_error', requestId: 'ray-1' } }
    })
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('[api-unhandled-error]', {
      requestId: 'ray-1',
      method: 'POST',
      path: '/api/v1/admin/posts',
      errorKind: 'Error'
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('provider secret')
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret=nope')
  })
})
