import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getQuery, getRouterParam } from 'h3'
import { commentError } from '../../../server/domain/comment-errors'
import {
  createCommentServiceForEvent,
  logCommentSecurityEvent
} from '../../../server/services/comment-service-factory'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return { ...actual, getQuery: vi.fn(), getRouterParam: vi.fn() }
})

vi.mock('../../../server/services/comment-service-factory', () => ({
  createCommentServiceForEvent: vi.fn(),
  logCommentSecurityEvent: vi.fn()
}))

import getComments from '../../../server/api/v1/posts/[slug]/comments.get'
import postComment from '../../../server/api/v1/posts/[slug]/comments.post'

type Handler = (event: unknown) => Promise<unknown>

function makeEvent(body?: unknown, overrides: Record<string, string> = {}) {
  const headers: Record<string, string | number> = {}
  const encodedBody = body === undefined ? null : new TextEncoder().encode(JSON.stringify(body))
  const event = {
    method: body === undefined ? 'GET' : 'POST',
    path: '/api/v1/posts/published-article/comments',
    _requestBody: encodedBody
      ? new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(encodedBody)
            controller.close()
          }
        })
      : undefined,
    node: {
      req: {
        headers: {
          host: 'blog.example.com',
          ...(encodedBody
            ? {
                'content-type': 'application/json',
                'content-length': String(encodedBody.byteLength)
              }
            : {}),
          ...overrides
        } as Record<string, string>,
        url: '/api/v1/posts/published-article/comments'
      },
      res: {
        statusCode: 200,
        setHeader: (key: string, value: string | number) => {
          headers[key] = value
        }
      }
    },
    context: {}
  }

  return { event, headers }
}

function commentService(implementation: Record<string, unknown>) {
  vi.mocked(createCommentServiceForEvent).mockReturnValue(implementation as never)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getQuery).mockReturnValue({})
})

describe('public comment route handlers', () => {
  it('GET returns approved comments for the validated slug with no-store', async () => {
    vi.mocked(getRouterParam).mockReturnValue('published-article')
    const approvedComments = [
      {
        id: 'comment-1',
        nickname: 'Reader',
        content: 'Helpful post.',
        createdAt: new Date('2026-07-01T00:00:00.000Z')
      }
    ]
    const listPublic = vi.fn().mockResolvedValue({ items: approvedComments, nextCursor: null })
    commentService({ listPublic })
    const { event, headers } = makeEvent()

    const body = await (getComments as Handler)(event)

    expect(body).toEqual({ data: approvedComments, meta: { nextCursor: null } })
    expect(createCommentServiceForEvent).toHaveBeenCalledWith(event)
    expect(listPublic).toHaveBeenCalledWith('published-article', { limit: 20 })
    expect(headers['Cache-Control']).toBe('no-store')
    expect(event.node.res.statusCode).toBe(200)
  })

  it('GET maps a malformed slug to the public 404 without calling the service', async () => {
    vi.mocked(getRouterParam).mockReturnValue('')
    commentService({ listPublic: vi.fn() })
    const { event, headers } = makeEvent()

    const body = await (getComments as Handler)(event)

    expect(body).toMatchObject({
      error: {
        code: 'not_found',
        message: 'Post not found',
        details: {},
        requestId: expect.any(String)
      }
    })
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(404)
    expect(headers['Cache-Control']).toBe('no-store')
  })

  it('GET maps a missing or ineligible service target to the same public 404', async () => {
    vi.mocked(getRouterParam).mockReturnValue('hidden-post')
    const listPublic = vi.fn().mockRejectedValue(commentError('not_found', 'Post not found', 404))
    commentService({ listPublic })
    const { event, headers } = makeEvent()

    const body = await (getComments as Handler)(event)

    expect(body).toMatchObject({
      error: {
        code: 'not_found',
        message: 'Post not found',
        details: {},
        requestId: expect.any(String)
      }
    })
    expect(event.node.res.statusCode).toBe(404)
    expect(headers['Cache-Control']).toBe('no-store')
  })

  it('POST submits the trimmed DTO including protection token and returns 201 pending', async () => {
    vi.mocked(getRouterParam).mockReturnValue('published-article')
    const requestBody = {
      nickname: '  Reader  ',
      email: 'reader@example.com',
      content: '  Helpful post.  ',
      protectionToken: 'opaque-token'
    }
    const submit = vi.fn().mockResolvedValue({ id: 'comment-1', status: 'pending' })
    commentService({ submit })
    const { event, headers } = makeEvent(requestBody)

    const body = await (postComment as Handler)(event)

    expect(submit).toHaveBeenCalledWith('published-article', {
      nickname: 'Reader',
      email: 'reader@example.com',
      content: 'Helpful post.',
      protectionToken: 'opaque-token',
      expectedHostname: 'blog.example.com'
    })
    expect(createCommentServiceForEvent).toHaveBeenCalledWith(event)
    expect(body).toEqual({ data: { id: 'comment-1', status: 'pending' }, meta: {} })
    expect(event.node.res.statusCode).toBe(201)
    expect(headers['Cache-Control']).toBe('no-store')
  })

  it('POST maps an invalid body to a 422 validation error without calling the service', async () => {
    vi.mocked(getRouterParam).mockReturnValue('published-article')
    commentService({ submit: vi.fn() })
    const { event, headers } = makeEvent({ nickname: ' ', content: '' })

    const body = await (postComment as Handler)(event)

    expect(body).toMatchObject({
      error: {
        code: 'validation_failed',
        message: 'Invalid comment input',
        details: { issues: expect.any(Array) },
        requestId: expect.any(String)
      }
    })
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(422)
    expect(headers['Cache-Control']).toBe('no-store')
  })

  it('GET rejects a malformed pagination cursor before calling the service', async () => {
    vi.mocked(getRouterParam).mockReturnValue('published-article')
    vi.mocked(getQuery).mockReturnValue({ cursor: 'not-a-cursor' })
    commentService({ listPublic: vi.fn() })
    const { event } = makeEvent()

    const body = await (getComments as Handler)(event)

    expect(body).toMatchObject({ error: { code: 'invalid_pagination' } })
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(400)
  })

  it('POST rejects oversized request bodies before service work', async () => {
    vi.mocked(getRouterParam).mockReturnValue('published-article')
    commentService({ submit: vi.fn() })
    const { event, headers } = makeEvent(
      { nickname: 'Reader', content: 'Hello' },
      { 'content-length': String(32 * 1024 + 1) }
    )

    const body = await (postComment as Handler)(event)

    expect(body).toMatchObject({
      error: { code: 'payload_too_large', message: 'Comment request body is too large' }
    })
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(413)
    expect(headers['Cache-Control']).toBe('no-store')
  })

  it('POST enforces the streaming byte limit when Content-Length is absent', async () => {
    vi.mocked(getRouterParam).mockReturnValue('published-article')
    commentService({ submit: vi.fn() })
    const { event } = makeEvent(
      { nickname: 'Reader', content: 'x'.repeat(33 * 1024) },
      { 'content-length': '' }
    )

    const body = await (postComment as Handler)(event)

    expect(body).toMatchObject({ error: { code: 'payload_too_large' } })
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(413)
  })

  it('POST returns Retry-After when the service rate limits submission', async () => {
    vi.mocked(getRouterParam).mockReturnValue('published-article')
    const submit = vi.fn().mockRejectedValue(commentError(
      'rate_limited',
      'Too many comment attempts. Please try again later',
      429,
      { retryAfterSeconds: 37 }
    ))
    commentService({ submit })
    const { event, headers } = makeEvent({ nickname: 'Reader', content: 'Hello' })

    const body = await (postComment as Handler)(event)

    expect(body).toMatchObject({ error: { code: 'rate_limited' } })
    expect(event.node.res.statusCode).toBe(429)
    expect(headers['Retry-After']).toBe(37)
  })

  it('POST maps a malformed slug to 404 before reading even an invalid body', async () => {
    vi.mocked(getRouterParam).mockReturnValue('')
    commentService({ submit: vi.fn() })
    const { event, headers } = makeEvent({ nickname: ' ', content: '' })

    const body = await (postComment as Handler)(event)

    expect(body).toMatchObject({
      error: {
        code: 'not_found',
        message: 'Post not found',
        details: {},
        requestId: expect.any(String)
      }
    })
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(404)
    expect(headers['Cache-Control']).toBe('no-store')
  })

  it('POST maps a missing or ineligible service target to the public 404', async () => {
    vi.mocked(getRouterParam).mockReturnValue('hidden-post')
    const submit = vi.fn().mockRejectedValue(commentError('not_found', 'Post not found', 404))
    commentService({ submit })
    const { event, headers } = makeEvent({ nickname: 'Reader', content: 'Hello' })

    const body = await (postComment as Handler)(event)

    expect(body).toMatchObject({
      error: {
        code: 'not_found',
        message: 'Post not found',
        details: {},
        requestId: expect.any(String)
      }
    })
    expect(event.node.res.statusCode).toBe(404)
    expect(headers['Cache-Control']).toBe('no-store')
  })

  it('POST rate limits repeated invalid requests before slug parsing or service access', async () => {
    vi.mocked(getRouterParam).mockReturnValue('')
    commentService({ submit: vi.fn() })

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { event } = makeEvent(
        { nickname: ' ', content: '' },
        { 'cf-connecting-ip': '203.0.113.99' }
      )
      const body = await (postComment as Handler)(event)
      expect(body).toMatchObject({ error: { code: 'not_found' } })
    }

    const { event, headers } = makeEvent(
      { nickname: ' ', content: '' },
      { 'cf-connecting-ip': '203.0.113.99' }
    )
    const body = await (postComment as Handler)(event)

    expect(body).toMatchObject({ error: { code: 'rate_limited' } })
    expect(event.node.res.statusCode).toBe(429)
    expect(headers['Retry-After']).toEqual(expect.any(Number))
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
    expect(logCommentSecurityEvent).toHaveBeenCalledWith({ event: 'comment_ingress_rate_limited' })
  })

  it('GET passes through the service public projection without adding private fields', async () => {
    vi.mocked(getRouterParam).mockReturnValue('published-article')
    const publicComment = {
      id: 'comment-1',
      nickname: 'Reader',
      content: 'Public content',
      createdAt: new Date('2026-07-01T00:00:00.000Z')
    }
    commentService({ listPublic: vi.fn().mockResolvedValue({ items: [publicComment], nextCursor: null }) })
    const { event } = makeEvent()

    const body = await (getComments as Handler)(event) as { data: Array<Record<string, unknown>> }

    // Repository and service tests prove the privacy projection; this controller
    // contract verifies the public response preserves it without adding fields.
    expect(body.data[0]).toEqual(publicComment)
    expect(body.data[0]).not.toHaveProperty('email')
  })
})
