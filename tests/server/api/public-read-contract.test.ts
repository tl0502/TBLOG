import { ZodError } from 'zod'
import { publicReadError } from '../../../server/domain/public-read-errors'
import { errorResponse, ok } from '../../../server/utils/api-response'
import { setPublicNoStoreHeaders } from '../../../server/utils/public-cache'
import { encodeCursor } from '../../../server/utils/cursor'
import { paginationQuerySchema, slugParamSchema } from '../../../server/validation/public-read-input'

describe('public read API contract', () => {
  it('wraps list payloads in the standard envelope with pagination meta', () => {
    expect(ok([{ slug: 'a' }], { nextCursor: 'abc' })).toEqual({
      data: [{ slug: 'a' }],
      meta: { nextCursor: 'abc' }
    })
  })

  it('maps not_found domain errors to a 404 error envelope', () => {
    const event = { node: { req: { headers: {} } } }

    expect(errorResponse(event as never, publicReadError('not_found', 'Post not found', 404))).toMatchObject({
      statusCode: 404,
      body: {
        error: {
          code: 'not_found',
          message: 'Post not found',
          requestId: expect.any(String)
        }
      }
    })
  })

  it('validates and coerces the pagination query', () => {
    const cursor = encodeCursor({ publishedAtMs: Date.parse('2026-07-16T00:00:00.000Z'), id: 'post-1' })
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 20 })
    expect(paginationQuerySchema.parse({ limit: '10', cursor })).toEqual({ limit: 10, cursor })
    expect(() => paginationQuerySchema.parse({ limit: '0' })).toThrow(ZodError)
    expect(() => paginationQuerySchema.parse({ limit: '100' })).toThrow(ZodError)
  })

  it('requires a non-empty slug', () => {
    expect(slugParamSchema.parse('hello-world')).toBe('hello-world')
    expect(() => slugParamSchema.parse('')).toThrow(ZodError)
  })

  it('disables dynamic response caching in the baseline Worker deployment', () => {
    const headers: Record<string, string> = {}
    const event = {
      node: {
        res: {
          setHeader: (key: string, value: string) => {
            headers[key] = value
          }
        }
      }
    }

    setPublicNoStoreHeaders(event as never)

    expect(headers['Cache-Control']).toBe('no-store')
  })
})
