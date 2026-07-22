import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHomeRailServiceForEvent } from '../../../server/services/home-rail-service-factory'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})
vi.mock('../../../server/services/home-rail-service-factory', () => ({ createHomeRailServiceForEvent: vi.fn() }))
import route from '../../../server/api/v1/home-rail/index.get'

describe('public home rail route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the public envelope from the home rail service', async () => {
    const value = { cards: {} }
    vi.mocked(createHomeRailServiceForEvent).mockReturnValue({ getPublicData: vi.fn().mockResolvedValue(value) } as never)

    const response = await (route as never as (event: Record<string, unknown>) => Promise<unknown>)({ node: { req: { headers: {} }, res: { setHeader: vi.fn() } }, context: {} })

    expect(response).toMatchObject({ data: value })
  })
})
