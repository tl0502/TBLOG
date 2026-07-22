import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError, getQuery, getRouterParam, readBody } from 'h3'
import { authError } from '../../../server/domain/auth-errors'
import { commentError } from '../../../server/domain/comment-errors'
import type { CommentService } from '../../../server/services/comment-service'
import { createCommentServiceForEvent } from '../../../server/services/comment-service-factory'
import { requireAdmin } from '../../../server/utils/require-admin'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    getQuery: vi.fn(),
    getRouterParam: vi.fn(),
    readBody: vi.fn()
  }
})

vi.mock('../../../server/utils/require-admin', () => ({
  requireAdmin: vi.fn()
}))

vi.mock('../../../server/services/comment-service-factory', () => ({
  createCommentServiceForEvent: vi.fn()
}))

import listComments from '../../../server/api/v1/admin/comments/index.get'
import getCommentCounts from '../../../server/api/v1/admin/comments/counts.get'
import moderateComment from '../../../server/api/v1/admin/comments/[id].patch'
import deleteComment from '../../../server/api/v1/admin/comments/[id].delete'
import autoModerateComments from '../../../server/api/v1/admin/comments/auto-moderation.post'

type Handler = (event: unknown) => Promise<unknown>

const currentAdmin = {
  administrator: { id: 'admin-1', username: 'admin' },
  permissions: ['comment:*'] as const
}

function makeEvent() {
  return {
    node: {
      req: { headers: { 'cf-ray': 'request-1' } },
      res: { statusCode: 200, setHeader: vi.fn() }
    },
    context: {}
  }
}

function commentService(implementation: Partial<CommentService>) {
  vi.mocked(createCommentServiceForEvent).mockReturnValue(implementation as CommentService)
}

function expectErrorEnvelope(
  body: unknown,
  expected: { code: string; message: string; details?: Record<string, unknown> }
) {
  expect(body).toEqual({
    error: {
      code: expected.code,
      message: expected.message,
      details: expected.details ?? {},
      requestId: 'request-1'
    }
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue(currentAdmin as never)
})

describe('admin comment route authentication order', () => {
  it('authenticates list requests before parsing the query or creating a service', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      authError('unauthorized', 'Authentication is required', 401)
    )
    const event = makeEvent()

    const body = await (listComments as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'unauthorized',
      message: 'Authentication is required'
    })
    expect(event.node.res.statusCode).toBe(401)
    expect(getQuery).not.toHaveBeenCalled()
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })

  it('authenticates count requests before creating a service', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      authError('unauthorized', 'Authentication is required', 401)
    )
    const event = makeEvent()

    const body = await (getCommentCounts as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'unauthorized',
      message: 'Authentication is required'
    })
    expect(event.node.res.statusCode).toBe(401)
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })

  it('authenticates moderation requests before parsing the id or body', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      authError('unauthorized', 'Authentication is required', 401)
    )
    const event = makeEvent()

    const body = await (moderateComment as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'unauthorized',
      message: 'Authentication is required'
    })
    expect(event.node.res.statusCode).toBe(401)
    expect(getRouterParam).not.toHaveBeenCalled()
    expect(readBody).not.toHaveBeenCalled()
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })

  it('authenticates delete requests before parsing the id', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      authError('unauthorized', 'Authentication is required', 401)
    )
    const event = makeEvent()

    const body = await (deleteComment as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'unauthorized',
      message: 'Authentication is required'
    })
    expect(event.node.res.statusCode).toBe(401)
    expect(getRouterParam).not.toHaveBeenCalled()
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })

  it('authenticates automatic moderation requests before reading the body', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      authError('unauthorized', 'Authentication is required', 401)
    )
    const event = makeEvent()

    const body = await (autoModerateComments as Handler)(event)

    expectErrorEnvelope(body, { code: 'unauthorized', message: 'Authentication is required' })
    expect(event.node.res.statusCode).toBe(401)
    expect(readBody).not.toHaveBeenCalled()
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })
})

describe('admin comment route handlers', () => {
  it('lists filtered comments with offset pagination metadata', async () => {
    vi.mocked(getQuery).mockReturnValue({ status: 'pending', offset: '20', limit: '10' })
    const items = [
      {
        id: 'comment-1',
        nickname: 'Reader',
        email: 'reader@example.com',
        content: 'Helpful post.',
        status: 'pending',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        reviewedAt: null,
        post: { id: 'post-1', slug: 'article', title: 'Article' }
      }
    ]
    const listAdmin = vi.fn().mockResolvedValue({ items, total: 31, offset: 20, limit: 10 })
    commentService({ listAdmin })
    const event = makeEvent()

    const body = await (listComments as Handler)(event)

    expect(listAdmin).toHaveBeenCalledWith(
      { status: 'pending', offset: 20, limit: 10 },
      currentAdmin.permissions
    )
    expect(body).toEqual({ data: items, meta: { total: 31, offset: 20, limit: 10 } })
    expect(event.node.res.statusCode).toBe(200)
  })

  it('returns authorized pending counts', async () => {
    const getCounts = vi.fn().mockResolvedValue({ pending: 4 })
    commentService({ getCounts })
    const event = makeEvent()

    const body = await (getCommentCounts as Handler)(event)

    expect(getCounts).toHaveBeenCalledWith(currentAdmin.permissions)
    expect(body).toEqual({ data: { pending: 4 }, meta: {} })
  })

  it.each(['approved', 'rejected'] as const)('moderates a comment to %s', async (status) => {
    vi.mocked(getRouterParam).mockReturnValue('comment-1')
    vi.mocked(readBody).mockResolvedValue({ status })
    const moderate = vi.fn().mockResolvedValue({ id: 'comment-1', status })
    commentService({ moderate })
    const event = makeEvent()

    const body = await (moderateComment as Handler)(event)

    expect(moderate).toHaveBeenCalledWith('comment-1', status, currentAdmin.permissions)
    expect(body).toEqual({ data: { id: 'comment-1', status }, meta: {} })
  })

  it('deletes a comment', async () => {
    vi.mocked(getRouterParam).mockReturnValue('comment-1')
    const remove = vi.fn().mockResolvedValue({ id: 'comment-1' })
    commentService({ remove })
    const event = makeEvent()

    const body = await (deleteComment as Handler)(event)

    expect(remove).toHaveBeenCalledWith('comment-1', currentAdmin.permissions)
    expect(body).toEqual({ data: { id: 'comment-1' }, meta: {} })
  })

  it('automatically moderates a bounded selection and returns per-item results', async () => {
    vi.mocked(readBody).mockResolvedValue({ ids: ['comment-1', 'comment-2'] })
    const result = {
      results: [
        { id: 'comment-1', outcome: 'approved', status: 'approved' },
        { id: 'comment-2', outcome: 'failed', status: 'pending' }
      ],
      summary: { requested: 2, succeeded: 1, failed: 1 }
    }
    const autoModerate = vi.fn().mockResolvedValue(result)
    commentService({ autoModerate })
    const event = makeEvent()

    const body = await (autoModerateComments as Handler)(event)

    expect(autoModerate).toHaveBeenCalledWith(['comment-1', 'comment-2'], currentAdmin.permissions)
    expect(body).toEqual({ data: result, meta: {} })
  })

  it.each([
    { ids: [] },
    { ids: ['duplicate', 'duplicate'] },
    { ids: Array.from({ length: 9 }, (_, index) => `comment-${index}`) }
  ])('returns 422 for invalid automatic moderation input %#', async (input) => {
    vi.mocked(readBody).mockResolvedValue(input)
    const event = makeEvent()

    const body = await (autoModerateComments as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'validation_failed',
      message: 'Invalid automatic moderation input',
      details: { issues: expect.any(Array) }
    })
    expect(event.node.res.statusCode).toBe(422)
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })

  it('returns the full 422 envelope for an invalid list query', async () => {
    vi.mocked(getQuery).mockReturnValue({ status: 'spam', offset: '-1', limit: '101' })
    const event = makeEvent()

    const body = await (listComments as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'validation_failed',
      message: 'Invalid comment query',
      details: { issues: expect.any(Array) }
    })
    expect(event.node.res.statusCode).toBe(422)
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })

  it('returns the full 422 envelope for an invalid moderation body', async () => {
    vi.mocked(getRouterParam).mockReturnValue('comment-1')
    vi.mocked(readBody).mockResolvedValue({ status: 'pending' })
    const event = makeEvent()

    const body = await (moderateComment as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'validation_failed',
      message: 'Invalid comment input',
      details: { issues: expect.any(Array) }
    })
    expect(event.node.res.statusCode).toBe(422)
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })

  it('returns the full 422 envelope when the moderation body is malformed JSON', async () => {
    vi.mocked(getRouterParam).mockReturnValue('comment-1')
    vi.mocked(readBody).mockRejectedValue(
      createError({ statusCode: 400, statusMessage: 'Bad Request' })
    )
    const event = makeEvent()

    const body = await (moderateComment as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'validation_failed',
      message: 'Invalid comment input'
    })
    expect(event.node.res.statusCode).toBe(422)
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })

  it('preserves an unexpected moderation body read failure as a 500 error', async () => {
    vi.mocked(getRouterParam).mockReturnValue('comment-1')
    vi.mocked(readBody).mockRejectedValue(new Error('stream failed'))
    const event = makeEvent()

    const body = await (moderateComment as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'internal_error',
      message: 'Internal server error'
    })
    expect(event.node.res.statusCode).toBe(500)
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })

  it.each([
    ['moderation', moderateComment, true],
    ['deletion', deleteComment, false]
  ] as const)('maps an invalid id to comment_not_found before %s service work', async (_, route, readsBody) => {
    vi.mocked(getRouterParam).mockReturnValue('   ')
    const event = makeEvent()

    const body = await (route as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'comment_not_found',
      message: 'Comment not found'
    })
    expect(event.node.res.statusCode).toBe(404)
    if (readsBody) {
      expect(readBody).not.toHaveBeenCalled()
    }
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })

  it.each([
    ['moderation', moderateComment, true],
    ['deletion', deleteComment, false]
  ] as const)('maps a missing id to comment_not_found before %s service work', async (_, route, readsBody) => {
    vi.mocked(getRouterParam).mockReturnValue(undefined)
    const event = makeEvent()

    const body = await (route as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'comment_not_found',
      message: 'Comment not found'
    })
    expect(event.node.res.statusCode).toBe(404)
    if (readsBody) {
      expect(readBody).not.toHaveBeenCalled()
    }
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })

  it.each([
    ['moderation', moderateComment, 'moderate'],
    ['deletion', deleteComment, 'remove']
  ] as const)('passes through service comment_not_found from %s', async (_, route, method) => {
    vi.mocked(getRouterParam).mockReturnValue('missing')
    vi.mocked(readBody).mockResolvedValue({ status: 'approved' })
    commentService({
      [method]: vi.fn().mockRejectedValue(
        commentError('comment_not_found', 'Comment not found', 404)
      )
    })
    const event = makeEvent()

    const body = await (route as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'comment_not_found',
      message: 'Comment not found'
    })
    expect(event.node.res.statusCode).toBe(404)
  })
})
