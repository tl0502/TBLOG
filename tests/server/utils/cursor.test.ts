import { decodeCursor, encodeCursor } from '../../../server/utils/cursor'

describe('pagination cursor', () => {
  it('round-trips publishedAtMs and id', () => {
    const cursor = encodeCursor({ publishedAtMs: 1719446400000, id: 'post-1' })

    expect(decodeCursor(cursor)).toEqual({ publishedAtMs: 1719446400000, id: 'post-1' })
  })

  it('produces a url-safe opaque token', () => {
    const cursor = encodeCursor({ publishedAtMs: 1719446400000, id: 'post-1' })

    expect(cursor).not.toMatch(/[+/=]/)
  })

  it('returns null for malformed or empty input', () => {
    expect(decodeCursor('')).toBeNull()
    expect(decodeCursor('not-base64-$$$')).toBeNull()
    expect(decodeCursor(encodeCursor({ publishedAtMs: 1, id: '' }))).toBeNull()
  })
})
