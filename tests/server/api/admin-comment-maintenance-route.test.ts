import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authError } from '../../../server/domain/auth-errors'
import { createCommentServiceForEvent } from '../../../server/services/comment-service-factory'
import { requireAdmin } from '../../../server/utils/require-admin'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('../../../server/utils/require-admin', () => ({ requireAdmin: vi.fn() }))
vi.mock('../../../server/services/comment-service-factory', () => ({
  createCommentServiceForEvent: vi.fn()
}))

import route from '../../../server/api/v1/admin/comments/maintenance.post'

function makeEvent() {
  return {
    node: { req: { headers: {} }, res: { statusCode: 200, setHeader: vi.fn() } },
    context: {}
  }
}

beforeEach(() => vi.resetAllMocks())

describe('POST /api/v1/admin/comments/maintenance', () => {
  it('requires administrator authentication before creating the service', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(authError('unauthorized', 'Authentication is required', 401))
    const event = makeEvent()

    const body = await (route as unknown as (event: ReturnType<typeof makeEvent>) => Promise<unknown>)(event)

    expect(event.node.res.statusCode).toBe(401)
    expect(body).toMatchObject({ error: { code: 'unauthorized' } })
    expect(createCommentServiceForEvent).not.toHaveBeenCalled()
  })

  it('passes the maintenance permission through the service boundary', async () => {
    const permissions = ['maintenance:*'] as const
    vi.mocked(requireAdmin).mockResolvedValue({ permissions } as never)
    const purgeExpiredModerationResults = vi.fn().mockResolvedValue(4)
    vi.mocked(createCommentServiceForEvent).mockReturnValue({ purgeExpiredModerationResults } as never)

    const body = await (route as unknown as (event: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())

    expect(purgeExpiredModerationResults).toHaveBeenCalledWith(permissions)
    expect(body).toEqual({ data: { deleted: 4 }, meta: {} })
  })
})
