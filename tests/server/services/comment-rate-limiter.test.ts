import { createMemoryCommentRateLimiter } from '../../../server/services/comment-rate-limiter'

describe('comment rate limiter', () => {
  it('reports the earliest active window when the bounded key table is full', () => {
    const limiter = createMemoryCommentRateLimiter(1)
    const startedAt = new Date('2026-07-19T00:00:00.000Z')

    expect(limiter.consume('first', { windowSeconds: 60, maxPerWindow: 5 }, startedAt).allowed).toBe(true)
    expect(limiter.consume(
      'second',
      { windowSeconds: 60, maxPerWindow: 5 },
      new Date(startedAt.getTime() + 15_000)
    )).toEqual({ allowed: false, retryAfterSeconds: 45 })
    expect(limiter.consume(
      'third',
      { windowSeconds: 60, maxPerWindow: 5 },
      new Date(startedAt.getTime() + 30_000)
    )).toEqual({ allowed: false, retryAfterSeconds: 30 })
  })
})
