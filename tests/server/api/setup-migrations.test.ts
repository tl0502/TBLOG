import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeD1 } from '../test-utils/fake-d1'
import { createAuthServiceForEvent } from '../../../server/services/auth-service-factory'

// The handler modules are Nitro route files that call the global `defineEventHandler`.
// The repo's existing API-handler tests shim it as a global via vi.hoisted; do the same here so the
// real handlers (and the real setup-window guard) run end-to-end against a fake D1 binding.
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

// The real migration service runs against the fake D1 (it only needs prepare/all/first/run/batch), so
// `isDatabaseUninitialized()` is exercised for real. The auth service reaches D1 through drizzle, whose
// driver needs a `.raw()` the Task-2 fake D1 does not implement — so we stub that one boundary. Its
// `getSetupStatus().required` behaviour is covered by the dedicated auth-service tests. The guard logic
// itself (the `||` and the 409) is the real handler code.
vi.mock('../../../server/services/auth-service-factory', () => ({
  createAuthServiceForEvent: vi.fn()
}))

type Handler = (event: unknown) => Promise<any>

function fakeEvent(d1: unknown, method: string) {
  return {
    context: { cloudflare: { env: { DB: d1, SESSION_SECRET: 'x'.repeat(32) } } },
    node: { req: { url: '/', method, headers: {} }, res: {} }
  }
}

describe('setup-window bootstrap migration endpoints', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses bootstrap once an administrator exists', async () => {
    const { d1, sqlite } = createFakeD1()
    // administrators table present + a row => not uninitialized, and setup no longer required.
    sqlite.exec("CREATE TABLE administrators (id text PRIMARY KEY, username text); INSERT INTO administrators VALUES ('a','admin');")
    vi.mocked(createAuthServiceForEvent).mockReturnValue({
      getSetupStatus: vi.fn().mockResolvedValue({ required: false })
    } as never)

    const handler = (await import('../../../server/api/v1/admin/setup/migrations.post')).default as Handler
    const body = await handler(fakeEvent(d1, 'POST'))

    expect(body.error?.code).toBe('setup_completed')
    expect(body.data).toBeUndefined()
  })

  it('applies migrations in bounded batches on an empty database', async () => {
    const { d1 } = createFakeD1()
    vi.mocked(createAuthServiceForEvent).mockReturnValue({
      getSetupStatus: vi.fn().mockResolvedValue({ required: true })
    } as never)
    const handler = (await import('../../../server/api/v1/admin/setup/migrations.post')).default as Handler
    let body = await handler(fakeEvent(d1, 'POST'))
    const applied = [...body.data.appliedNow]
    while (body.data.pending.length > 0) {
      body = await handler(fakeEvent(d1, 'POST'))
      applied.push(...body.data.appliedNow)
    }

    expect(applied.length).toBeGreaterThanOrEqual(31)
    expect(body.data.pending).toEqual([])
    expect(createAuthServiceForEvent).toHaveBeenCalled()
  })

  it('GET reports pending migrations during the setup window', async () => {
    const { d1 } = createFakeD1()
    const handler = (await import('../../../server/api/v1/admin/setup/migrations.get')).default as Handler
    const body = await handler(fakeEvent(d1, 'GET'))

    expect(body.data.pendingCount).toBeGreaterThanOrEqual(31)
    expect(body.data.appliedCount).toBe(0)
  })
})
