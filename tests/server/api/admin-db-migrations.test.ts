import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainError } from '../../../server/domain/domain-error'

// The handler modules are Nitro route files that call the global `defineEventHandler`.
// The repo's existing API-handler tests shim it as a global via vi.hoisted; do the same here.
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

// `requireAdmin` performs a DB-backed session lookup + IP/origin checks; mock it at the boundary so we
// can exercise both the rejected (unauthenticated) and resolved (authenticated) branches of the thin
// handlers without standing up real auth state. Assert the factory is never reached when rejected —
// that is the core guarantee: the admin guard runs before any migration work.
vi.mock('../../../server/utils/require-admin', () => ({
  requireAdmin: vi.fn()
}))
vi.mock('../../../server/services/db-migration-service-factory', () => ({
  createDbMigrationServiceForEvent: vi.fn()
}))

import { requireAdmin } from '../../../server/utils/require-admin'
import { createDbMigrationServiceForEvent } from '../../../server/services/db-migration-service-factory'

type Handler = (event: unknown) => Promise<any>

function fakeEvent(method: string) {
  return {
    context: {},
    node: { req: { url: '/api/v1/admin/maintenance/db-migrations', method, headers: {} }, res: {} }
  }
}

async function getHandler() {
  return (await import('../../../server/api/v1/admin/maintenance/db-migrations.get')).default as Handler
}
async function postHandler() {
  return (await import('../../../server/api/v1/admin/maintenance/db-migrations.post')).default as Handler
}

describe('admin incremental migration endpoints', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an unauthenticated status request before any migration work', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      new DomainError('unauthorized', 'Authentication is required', 401)
    )
    const handler = await getHandler()

    const body = await handler(fakeEvent('GET'))

    expect(['unauthorized', 'forbidden']).toContain(body.error?.code)
    expect(body.data).toBeUndefined()
    expect(createDbMigrationServiceForEvent).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated apply request before any migration work', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      new DomainError('forbidden', 'Access denied', 403)
    )
    const handler = await postHandler()

    const body = await handler(fakeEvent('POST'))

    expect(['unauthorized', 'forbidden']).toContain(body.error?.code)
    expect(body.data).toBeUndefined()
    expect(createDbMigrationServiceForEvent).not.toHaveBeenCalled()
  })

  it('returns migration status for an authenticated administrator', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never)
    const status = { appliedCount: 31, pendingCount: 0, pending: [] }
    const getStatus = vi.fn().mockResolvedValue(status)
    vi.mocked(createDbMigrationServiceForEvent).mockReturnValue({ getStatus } as never)
    const handler = await getHandler()

    const body = await handler(fakeEvent('GET'))

    expect(getStatus).toHaveBeenCalledOnce()
    expect(body).toEqual({ data: status, meta: {} })
  })

  it('applies pending migrations for an authenticated administrator', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never)
    const result = { appliedNow: ['0001'], pending: [] }
    const applyPending = vi.fn().mockResolvedValue(result)
    vi.mocked(createDbMigrationServiceForEvent).mockReturnValue({ applyPending } as never)
    const handler = await postHandler()

    const body = await handler(fakeEvent('POST'))

    expect(applyPending).toHaveBeenCalledOnce()
    expect(body).toEqual({ data: result, meta: {} })
  })
})
