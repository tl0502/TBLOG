import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError, getRouterParam, readBody, setResponseHeader } from 'h3'
import { authError } from '../../../server/domain/auth-errors'
import { integrationError } from '../../../server/domain/integration-errors'
import type { IntegrationService } from '../../../server/services/integration-service'
import { createIntegrationServiceForEvent } from '../../../server/services/integration-service-factory'
import { requireAdmin } from '../../../server/utils/require-admin'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    getRouterParam: vi.fn(),
    readBody: vi.fn(),
    setResponseHeader: vi.fn()
  }
})

vi.mock('../../../server/utils/require-admin', () => ({
  requireAdmin: vi.fn()
}))

vi.mock('../../../server/services/integration-service-factory', () => ({
  createIntegrationServiceForEvent: vi.fn()
}))

import listIntegrations from '../../../server/api/v1/admin/integrations/index.get'
import updateIntegration from '../../../server/api/v1/admin/integrations/[capability]/[provider].put'
import runIntegrationAction from '../../../server/api/v1/admin/integrations/[capability]/[provider]/actions/[action].post'

type Handler = (event: unknown) => Promise<unknown>

const currentAdmin = {
  administrator: { id: 'admin-1', username: 'admin' },
  permissions: ['integration:*'] as const
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

function integrationService(implementation: Partial<IntegrationService>) {
  vi.mocked(createIntegrationServiceForEvent).mockReturnValue(implementation as IntegrationService)
}

function routerParams(params: Record<string, string | undefined>) {
  vi.mocked(getRouterParam).mockImplementation((_event, name) => params[name as string])
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

describe('admin integration route authentication order', () => {
  it.each([
    ['list', listIntegrations],
    ['update', updateIntegration],
    ['action', runIntegrationAction]
  ] as const)('authenticates %s before creating a service', async (_, route) => {
    vi.mocked(requireAdmin).mockRejectedValue(
      authError('unauthorized', 'Authentication is required', 401)
    )
    const event = makeEvent()

    const body = await (route as Handler)(event)

    expectErrorEnvelope(body, { code: 'unauthorized', message: 'Authentication is required' })
    expect(event.node.res.statusCode).toBe(401)
    expect(createIntegrationServiceForEvent).not.toHaveBeenCalled()
  })
})

describe('admin integration route handlers', () => {
  it('lists integrations with a no-store header and total metadata', async () => {
    const items = [{ capability: 'search', providerKey: 'algolia' }]
    const list = vi.fn().mockResolvedValue(items)
    integrationService({ list })
    const event = makeEvent()

    const body = await (listIntegrations as Handler)(event)

    expect(list).toHaveBeenCalledWith(currentAdmin.permissions)
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'no-store')
    expect(body).toEqual({ data: items, meta: { total: 1 } })
  })

  it('updates an integration from the parsed params and body', async () => {
    routerParams({ capability: 'commentProtection', provider: 'turnstile' })
    vi.mocked(readBody).mockResolvedValue({ enabled: true, config: { siteKey: 'site-1' } })
    const update = vi.fn().mockResolvedValue({ providerKey: 'turnstile', status: 'configured' })
    integrationService({ update })
    const event = makeEvent()

    const body = await (updateIntegration as Handler)(event)

    expect(update).toHaveBeenCalledWith(
      'commentProtection',
      'turnstile',
      { enabled: true, config: { siteKey: 'site-1' } },
      currentAdmin.permissions
    )
    expect(body).toEqual({ data: { providerKey: 'turnstile', status: 'configured' }, meta: {} })
  })

  it('maps an unknown capability to provider_not_found before service work', async () => {
    routerParams({ capability: 'bogus', provider: 'turnstile' })
    const event = makeEvent()

    const body = await (updateIntegration as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'provider_not_found',
      message: 'Integration provider not found'
    })
    expect(event.node.res.statusCode).toBe(404)
    expect(createIntegrationServiceForEvent).not.toHaveBeenCalled()
  })

  it('returns a 422 envelope for an invalid update body', async () => {
    routerParams({ capability: 'commentProtection', provider: 'turnstile' })
    vi.mocked(readBody).mockResolvedValue({ enabled: 'yes' })
    const event = makeEvent()

    const body = await (updateIntegration as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'validation_failed',
      message: 'Invalid integration input',
      details: { issues: expect.any(Array) }
    })
    expect(event.node.res.statusCode).toBe(422)
    expect(createIntegrationServiceForEvent).not.toHaveBeenCalled()
  })

  it('returns a 422 envelope when the update body is malformed JSON', async () => {
    routerParams({ capability: 'commentProtection', provider: 'turnstile' })
    vi.mocked(readBody).mockRejectedValue(createError({ statusCode: 400, statusMessage: 'Bad Request' }))
    const event = makeEvent()

    const body = await (updateIntegration as Handler)(event)

    expectErrorEnvelope(body, { code: 'validation_failed', message: 'Invalid integration input' })
    expect(event.node.res.statusCode).toBe(422)
  })

  it('propagates a provider_not_found error raised by the service', async () => {
    routerParams({ capability: 'search', provider: 'unknown' })
    vi.mocked(readBody).mockResolvedValue({ enabled: false, config: {} })
    integrationService({
      update: vi.fn().mockRejectedValue(
        integrationError('provider_not_found', 'Integration provider not found', 404)
      )
    })
    const event = makeEvent()

    const body = await (updateIntegration as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'provider_not_found',
      message: 'Integration provider not found'
    })
    expect(event.node.res.statusCode).toBe(404)
  })

  it('runs an integration action from the parsed params', async () => {
    routerParams({ capability: 'commentProtection', provider: 'turnstile', action: 'test' })
    const runAction = vi.fn().mockResolvedValue({ providerKey: 'turnstile', status: 'active' })
    integrationService({ runAction })
    const event = makeEvent()

    const body = await (runIntegrationAction as Handler)(event)

    expect(runAction).toHaveBeenCalledWith(
      'commentProtection',
      'turnstile',
      'test',
      currentAdmin.permissions
    )
    expect(body).toEqual({ data: { providerKey: 'turnstile', status: 'active' }, meta: {} })
  })

  it('maps a blank action param to action_not_found', async () => {
    routerParams({ capability: 'commentProtection', provider: 'turnstile', action: '   ' })
    const event = makeEvent()

    const body = await (runIntegrationAction as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'action_not_found',
      message: 'Integration action not found'
    })
    expect(event.node.res.statusCode).toBe(404)
    expect(createIntegrationServiceForEvent).not.toHaveBeenCalled()
  })
})
