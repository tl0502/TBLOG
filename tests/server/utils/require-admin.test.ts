import { beforeEach, vi } from 'vitest'

vi.mock('../../../server/services/auth-service-factory', () => ({
  createAuthServiceForEvent: vi.fn()
}))
vi.mock('../../../server/services/admin-security-service-factory', () => ({
  createAdminSecurityServiceForEvent: vi.fn()
}))
vi.mock('../../../server/utils/admin-request-ip', () => ({
  resolveAdminRequestIp: vi.fn(() => '127.0.0.1')
}))
vi.mock('../../../server/utils/session-cookie', () => ({
  getSessionCookie: vi.fn()
}))

import { requireAdmin } from '../../../server/utils/require-admin'
import { createAuthServiceForEvent } from '../../../server/services/auth-service-factory'
import { createAdminSecurityServiceForEvent } from '../../../server/services/admin-security-service-factory'
import { getSessionCookie } from '../../../server/utils/session-cookie'

const mockedFactory = vi.mocked(createAuthServiceForEvent)
const mockedSecurityFactory = vi.mocked(createAdminSecurityServiceForEvent)
const mockedCookie = vi.mocked(getSessionCookie)
const assertIpAllowed = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  assertIpAllowed.mockResolvedValue(undefined)
  mockedSecurityFactory.mockReturnValue({ assertIpAllowed } as never)
})

describe('requireAdmin', () => {
  it('resolves the administrator and forwards the session cookie', async () => {
    const result = { administrator: { username: 'editor' }, permissions: [] }
    const getCurrentAdministrator = vi.fn().mockResolvedValue(result)
    mockedCookie.mockReturnValue('token-123')
    mockedFactory.mockReturnValue({ getCurrentAdministrator } as never)

    await expect(requireAdmin({} as never)).resolves.toBe(result)
    expect(getCurrentAdministrator).toHaveBeenCalledWith('token-123')
    expect(assertIpAllowed).toHaveBeenCalledWith('127.0.0.1')
  })

  it('propagates the 401 when the session is absent or invalid', async () => {
    const getCurrentAdministrator = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('nope'), { code: 'unauthorized', statusCode: 401 }))
    mockedCookie.mockReturnValue(undefined)
    mockedFactory.mockReturnValue({ getCurrentAdministrator } as never)

    await expect(requireAdmin({} as never)).rejects.toMatchObject({
      code: 'unauthorized',
      statusCode: 401
    })
  })
})
