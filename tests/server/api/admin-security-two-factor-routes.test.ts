import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readBody } from 'h3'
import { authError } from '../../../server/domain/auth-errors'
import { createAdminSecurityServiceForEvent } from '../../../server/services/admin-security-service-factory'
import { requireAdmin } from '../../../server/utils/require-admin'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return { ...actual, readBody: vi.fn() }
})
vi.mock('../../../server/utils/require-admin', () => ({ requireAdmin: vi.fn() }))
vi.mock('../../../server/services/admin-security-service-factory', () => ({
  createAdminSecurityServiceForEvent: vi.fn()
}))

import enableRoute from '../../../server/api/v1/admin/security/two-factor/enable.post'

type Handler = (event: unknown) => Promise<unknown>

function event() {
  return {
    node: {
      req: { headers: { 'cf-ray': 'security-ray-1' } },
      res: { statusCode: 200, setHeader: vi.fn() }
    },
    context: {}
  }
}

const currentAdmin = {
  administrator: { id: 'admin-1', username: 'owner' },
  permissions: ['user:*']
}

describe('administrator two-factor enable route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(requireAdmin).mockResolvedValue(currentAdmin as never)
  })

  it('requires currentPassword and a 6-digit code before enabling', async () => {
    const enableTwoFactor = vi.fn()
    vi.mocked(createAdminSecurityServiceForEvent).mockReturnValue({ enableTwoFactor } as never)
    vi.mocked(readBody).mockResolvedValue({ code: '123456' })
    const request = event()

    const body = await (enableRoute as Handler)(request) as { error: { code: string } }
    expect(request.node.res.statusCode).toBe(422)
    expect(body.error.code).toBe('validation_failed')
    expect(enableTwoFactor).not.toHaveBeenCalled()
  })

  it('passes the validated password and code to the security service', async () => {
    const enableTwoFactor = vi.fn().mockResolvedValue({ recoveryCodes: ['ABCD-EFGH'] })
    vi.mocked(createAdminSecurityServiceForEvent).mockReturnValue({ enableTwoFactor } as never)
    vi.mocked(readBody).mockResolvedValue({
      currentPassword: 'correct horse battery staple',
      code: '123456'
    })

    await expect((enableRoute as Handler)(event())).resolves.toEqual({
      data: { recoveryCodes: ['ABCD-EFGH'] },
      meta: {}
    })
    expect(enableTwoFactor).toHaveBeenCalledWith(currentAdmin, {
      currentPassword: 'correct horse battery staple',
      code: '123456'
    })
  })

  it('maps an already-enabled domain error without rewriting recovery state', async () => {
    const enableTwoFactor = vi.fn().mockRejectedValue(
      authError('two_factor_already_enabled', 'Two-factor authentication is already enabled', 409)
    )
    vi.mocked(createAdminSecurityServiceForEvent).mockReturnValue({ enableTwoFactor } as never)
    vi.mocked(readBody).mockResolvedValue({
      currentPassword: 'correct horse battery staple',
      code: '123456'
    })
    const request = event()

    const body = await (enableRoute as Handler)(request) as { error: { code: string; message: string } }
    expect(request.node.res.statusCode).toBe(409)
    expect(body.error).toMatchObject({
      code: 'two_factor_already_enabled',
      message: 'Two-factor authentication is already enabled'
    })
  })
})
