import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createIntegrationServiceForEvent } from '../../../server/services/integration-service-factory'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('../../../server/services/integration-service-factory', () => ({
  createIntegrationServiceForEvent: vi.fn()
}))

import searchConfigRoute from '../../../server/api/v1/search-config.get'

type Handler = (event: unknown) => Promise<unknown>

function makeEvent() {
  return {
    node: {
      req: { headers: {} as Record<string, string> },
      res: { statusCode: 200, setHeader: vi.fn() }
    },
    context: {}
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('public search-config route', () => {
  it('returns the public search config without dynamic response caching', async () => {
    const config = {
      enabled: true,
      provider: 'algolia',
      config: { appId: 'A1', searchOnlyKey: 'search-key', indexName: 'posts' }
    }
    const getPublicSearchConfig = vi.fn().mockResolvedValue(config)
    vi.mocked(createIntegrationServiceForEvent).mockReturnValue({ getPublicSearchConfig } as never)
    const event = makeEvent()

    const body = await (searchConfigRoute as Handler)(event)

    expect(body).toEqual({ data: config, meta: {} })
    expect(event.node.res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store'
    )
  })
})
