import {
  adminCommentListQuerySchema,
  autoModerateCommentsInputSchema,
  commentIdParamSchema,
  moderateCommentInputSchema,
  publicCommentListQuerySchema,
  submitCommentInputSchema
} from '../../../server/validation/comment-input'
import { encodeCursor } from '../../../server/utils/cursor'

describe('comment input validation', () => {
  it('trims a valid public submission and preserves an optional token', () => {
    expect(submitCommentInputSchema.parse({
      nickname: '  Reader  ',
      email: 'reader@example.com',
      content: '  Helpful post.  ',
      protectionToken: 'opaque'
    })).toEqual({
      nickname: 'Reader',
      email: 'reader@example.com',
      content: 'Helpful post.',
      protectionToken: 'opaque'
    })
  })

  it('accepts an omitted email and protection token', () => {
    expect(submitCommentInputSchema.parse({ nickname: 'R', content: 'Hi' })).toEqual({
      nickname: 'R',
      content: 'Hi'
    })
  })

  it('rejects blank/oversized public fields and an invalid email', () => {
    expect(() => submitCommentInputSchema.parse({ nickname: ' ', content: 'x' })).toThrow()
    expect(() => submitCommentInputSchema.parse({ nickname: 'x'.repeat(81), content: 'x' })).toThrow()
    expect(() => submitCommentInputSchema.parse({ nickname: 'x', email: 'bad', content: 'x' })).toThrow()
    expect(() => submitCommentInputSchema.parse({ nickname: 'x', content: 'x'.repeat(5001) })).toThrow()
    expect(() => submitCommentInputSchema.parse({
      nickname: 'x', content: 'x', protectionToken: 't'.repeat(2049)
    })).toThrow()
    expect(() => submitCommentInputSchema.parse({ nickname: 'x', content: 'safe\u202Espoofed' })).toThrow()
    expect(() => submitCommentInputSchema.parse({ nickname: 'x', content: 'safe\u061Cspoofed' })).toThrow()
    expect(() => submitCommentInputSchema.parse({ nickname: 'x', content: 'safe\u200Fspoofed' })).toThrow()
    expect(() => submitCommentInputSchema.parse({ nickname: 'x', content: '\u200b' })).toThrow()
  })

  it('coerces admin pagination and filters', () => {
    expect(adminCommentListQuerySchema.parse({})).toEqual({ offset: 0, limit: 20 })
    expect(adminCommentListQuerySchema.parse({ status: 'pending', offset: '20', limit: '10' }))
      .toEqual({ status: 'pending', offset: 20, limit: 10 })
  })

  it('rejects invalid admin status and pagination', () => {
    expect(() => adminCommentListQuerySchema.parse({ status: 'spam' })).toThrow()
    expect(() => adminCommentListQuerySchema.parse({ offset: '-1' })).toThrow()
    expect(() => adminCommentListQuerySchema.parse({ limit: '101' })).toThrow()
  })

  it('accepts only approved or rejected moderation updates', () => {
    expect(moderateCommentInputSchema.parse({ status: 'approved' })).toEqual({ status: 'approved' })
    expect(moderateCommentInputSchema.parse({ status: 'rejected' })).toEqual({ status: 'rejected' })
    expect(() => moderateCommentInputSchema.parse({ status: 'pending' })).toThrow()
  })

  it('requires a non-empty comment id', () => {
    expect(commentIdParamSchema.parse('comment-1')).toBe('comment-1')
    expect(() => commentIdParamSchema.parse('   ')).toThrow()
  })

  it('validates bounded public comment cursor pagination', () => {
    const cursor = encodeCursor({ publishedAtMs: Date.now(), id: 'comment-1' })
    expect(publicCommentListQuerySchema.parse({ cursor, limit: '25' })).toEqual({ cursor, limit: 25 })
    expect(publicCommentListQuerySchema.parse({})).toEqual({ limit: 20 })
    expect(() => publicCommentListQuerySchema.parse({ cursor: 'invalid' })).toThrow()
    expect(() => publicCommentListQuerySchema.parse({ limit: 51 })).toThrow()
  })

  it('accepts a reply target and rejects unsafe invisible nickname characters', () => {
    expect(submitCommentInputSchema.parse({ nickname: 'Reader', content: 'Reply', parentCommentId: ' parent-1 ' }))
      .toMatchObject({ parentCommentId: 'parent-1' })
    expect(() => submitCommentInputSchema.parse({ nickname: 'Admin\u200b', content: 'Hidden suffix' })).toThrow()
    expect(() => submitCommentInputSchema.parse({ nickname: 'Admin\u00ad', content: 'Hidden suffix' })).toThrow()
  })

  it('accepts one to eight unique comment ids for automatic moderation', () => {
    expect(autoModerateCommentsInputSchema.parse({ ids: [' comment-1 ', 'comment-2'] }))
      .toEqual({ ids: ['comment-1', 'comment-2'] })
    expect(() => autoModerateCommentsInputSchema.parse({ ids: [] })).toThrow()
    expect(() => autoModerateCommentsInputSchema.parse({ ids: ['same', 'same'] })).toThrow()
    expect(() => autoModerateCommentsInputSchema.parse({
      ids: Array.from({ length: 9 }, (_, index) => `comment-${index}`)
    })).toThrow()
  })
})
