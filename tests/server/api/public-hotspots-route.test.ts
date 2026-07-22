import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPublicHotspotServiceForEvent } from '../../../server/services/public-hotspot-service-factory'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('../../../server/services/public-hotspot-service-factory', () => ({
  createPublicHotspotServiceForEvent: vi.fn()
}))

import route from '../../../server/api/v1/hotspots/index.get'

describe('public hotspots route', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns the public envelope and window metadata without response caching', async () => {
    const value = { current: [], historical: [] }
    vi.mocked(createPublicHotspotServiceForEvent).mockReturnValue({ getHotspots: vi.fn().mockResolvedValue(value) } as never)
    const headers: Record<string, string> = {}
    const event = { node: { req: { headers: {} }, res: { statusCode: 200, setHeader: (key: string, val: string) => { headers[key] = val } } }, context: {} }

    await expect((route as never as (event: unknown) => Promise<unknown>)(event)).resolves.toEqual({
      data: value,
      meta: { currentDays: 7, retentionDays: 730 }
    })
    expect(headers['Cache-Control']).toBe('no-store')
  })
})
