import { encodeCursor } from '../../../server/utils/cursor'
import { homeFeedQuerySchema, paginationQuerySchema } from '../../../server/validation/public-read-input'

describe('public pagination input', () => {
  it('validates the numbered home-feed sorting query', () => {
    expect(homeFeedQuerySchema.parse({})).toEqual({ page: 1, limit: 25, sort: 'publishedAt', order: 'desc' })
    expect(homeFeedQuerySchema.parse({ page: '2', limit: '10', sort: 'pageViews', order: 'asc' })).toEqual({
      page: 2, limit: 10, sort: 'pageViews', order: 'asc'
    })
    expect(() => homeFeedQuerySchema.parse({ limit: '26' })).toThrow()
    expect(() => homeFeedQuerySchema.parse({ sort: 'comments' })).toThrow()
  })

  it('accepts a valid opaque cursor', () => {
    const cursor = encodeCursor({ publishedAtMs: Date.parse('2026-07-16T00:00:00.000Z'), id: 'post-1' })
    expect(paginationQuerySchema.parse({ cursor })).toEqual({ cursor, limit: 20 })
  })

  it.each(['not-base64!', btoa('missing-separator'), btoa('NaN:post-1'), btoa('9007199254740992:post-1')])(
    'rejects malformed cursor %s',
    (cursor) => {
      expect(() => paginationQuerySchema.parse({ cursor })).toThrow()
    }
  )
})
