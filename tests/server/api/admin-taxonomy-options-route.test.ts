import { beforeEach, vi } from 'vitest'
import { authError } from '../../../server/domain/auth-errors'
import { createAdminTaxonomyServiceForEvent } from '../../../server/services/admin-taxonomy-service-factory'
import { requireAdmin } from '../../../server/utils/require-admin'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('../../../server/utils/require-admin', () => ({
  requireAdmin: vi.fn()
}))

vi.mock('../../../server/services/admin-taxonomy-service-factory', () => ({
  createAdminTaxonomyServiceForEvent: vi.fn()
}))

import taxonomyOptionsRoute from '../../../server/api/v1/admin/taxonomy-options.get'

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

describe('admin taxonomy options route', () => {
  it('requires an administrator session before reading taxonomy options', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      authError('unauthorized', 'Authentication is required', 401)
    )
    const event = makeEvent()

    const body = await (taxonomyOptionsRoute as Handler)(event)

    expect(event.node.res.statusCode).toBe(401)
    expect(body).toMatchObject({ error: { code: 'unauthorized' } })
    expect(createAdminTaxonomyServiceForEvent).not.toHaveBeenCalled()
  })

  it('returns id/name editor options without public slug/count projection fields', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      administrator: { id: 'admin-1', username: 'admin' },
      permissions: []
    } as never)
    const getOptions = vi.fn().mockResolvedValue({
      categories: [{ id: 'cat1', name: 'Engineering' }],
      tags: [{ id: 'tag1', name: 'Nuxt' }]
    })
    vi.mocked(createAdminTaxonomyServiceForEvent).mockReturnValue({ getOptions } as never)
    const event = makeEvent()

    const body = await (taxonomyOptionsRoute as Handler)(event)

    expect(body).toEqual({
      data: {
        categories: [{ id: 'cat1', name: 'Engineering' }],
        tags: [{ id: 'tag1', name: 'Nuxt' }]
      },
      meta: {}
    })
    expect(Object.keys((body as { data: { categories: unknown[] } }).data.categories[0] as object).sort())
      .toEqual(['id', 'name'])
    expect(JSON.stringify(body)).not.toContain('articleCount')
    expect(JSON.stringify(body)).not.toContain('slug')
  })
})
