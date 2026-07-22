import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRequestHeader, getRouterParam, readBody } from 'h3'
import { authError } from '../../../server/domain/auth-errors'
import { settingsDefaults } from '../../../server/domain/settings'
import { settingsError } from '../../../server/domain/settings-errors'
import { createSettingsServiceForEvent } from '../../../server/services/settings-service-factory'
import { requireAdmin } from '../../../server/utils/require-admin'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    getRequestHeader: vi.fn(),
    getRouterParam: vi.fn(),
    readBody: vi.fn()
  }
})

vi.mock('../../../server/utils/require-admin', () => ({
  requireAdmin: vi.fn()
}))

vi.mock('../../../server/services/settings-service-factory', () => ({
  createSettingsServiceForEvent: vi.fn()
}))

import getRoute from '../../../server/api/v1/admin/settings/[domain].get'
import putRoute from '../../../server/api/v1/admin/settings/[domain].put'

type Handler = (event: unknown) => Promise<unknown>

function makeEvent() {
  return {
    node: {
      req: { headers: { 'cf-ray': 'request-1' } },
      res: { statusCode: 200, setHeader: vi.fn() }
    },
    context: {}
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('admin settings [domain] routes', () => {
  it('GET requires an administrator session', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(authError('unauthorized', 'Authentication is required', 401))
    vi.mocked(getRouterParam).mockReturnValue('site')
    const event = makeEvent()

    const body = await (getRoute as Handler)(event)

    expect(event.node.res.statusCode).toBe(401)
    expect(body).toMatchObject({ error: { code: 'unauthorized' } })
    expect(createSettingsServiceForEvent).not.toHaveBeenCalled()
  })

  it('GET returns the domain settings wrapped in the data/meta envelope', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never)
    vi.mocked(getRouterParam).mockReturnValue('seo')
    const getDomain = vi.fn().mockResolvedValue(settingsDefaults.seo)
    vi.mocked(createSettingsServiceForEvent).mockReturnValue({ getDomain } as never)

    const body = await (getRoute as Handler)(makeEvent())

    expect(getDomain).toHaveBeenCalledWith('seo')
    expect(body).toEqual({ data: settingsDefaults.seo, meta: { domain: 'seo' } })
  })

  it('GET returns the profile revision with the profile snapshot', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never)
    vi.mocked(getRouterParam).mockReturnValue('profile')
    const getProfileSnapshot = vi.fn().mockResolvedValue({
      value: settingsDefaults.profile,
      revision: 42
    })
    vi.mocked(createSettingsServiceForEvent).mockReturnValue({ getProfileSnapshot } as never)

    const body = await (getRoute as Handler)(makeEvent())

    expect(body).toEqual({ data: settingsDefaults.profile, meta: { domain: 'profile', revision: 42 } })
  })

  it('GET maps an unknown domain to a 404 invalid_domain error', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never)
    vi.mocked(getRouterParam).mockReturnValue('nope')
    const getDomain = vi
      .fn()
      .mockRejectedValue(settingsError('invalid_domain', 'Unknown settings domain "nope"', 404))
    vi.mocked(createSettingsServiceForEvent).mockReturnValue({ getDomain } as never)
    const event = makeEvent()

    const body = await (getRoute as Handler)(event)

    expect(event.node.res.statusCode).toBe(404)
    expect(body).toMatchObject({ error: { code: 'invalid_domain' } })
  })

  it('PUT validates the body, saves, and returns the persisted settings', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never)
    vi.mocked(getRouterParam).mockReturnValue('site')
    vi.mocked(readBody).mockResolvedValue({ siteName: 'Saved' })
    const saved = { ...settingsDefaults.site, siteName: 'Saved' }
    const updateDomain = vi.fn().mockResolvedValue(saved)
    vi.mocked(createSettingsServiceForEvent).mockReturnValue({ updateDomain } as never)

    const body = await (putRoute as Handler)(makeEvent())

    expect(updateDomain).toHaveBeenCalledWith('site', expect.objectContaining({ siteName: 'Saved' }))
    expect(body).toEqual({ data: saved, meta: { domain: 'site' } })
  })

  it('PUT conditionally saves profile settings with the supplied revision', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never)
    vi.mocked(getRouterParam).mockReturnValue('profile')
    vi.mocked(getRequestHeader).mockImplementation((_, name) => name === 'x-settings-revision' ? '41' : undefined)
    vi.mocked(readBody).mockResolvedValue(settingsDefaults.profile)
    const updateProfile = vi.fn().mockResolvedValue({ value: settingsDefaults.profile, revision: 42 })
    vi.mocked(createSettingsServiceForEvent).mockReturnValue({ updateProfile } as never)

    const body = await (putRoute as Handler)(makeEvent())

    expect(updateProfile).toHaveBeenCalledWith(settingsDefaults.profile, 41)
    expect(body).toEqual({ data: settingsDefaults.profile, meta: { domain: 'profile', revision: 42 } })
  })

  it('PUT rejects an invalid profile revision header', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never)
    vi.mocked(getRouterParam).mockReturnValue('profile')
    vi.mocked(getRequestHeader).mockImplementation((_, name) => name === 'x-settings-revision' ? 'stale' : undefined)
    vi.mocked(readBody).mockResolvedValue(settingsDefaults.profile)
    const updateProfile = vi.fn()
    vi.mocked(createSettingsServiceForEvent).mockReturnValue({ updateProfile } as never)
    const event = makeEvent()

    const body = await (putRoute as Handler)(event)

    expect(event.node.res.statusCode).toBe(400)
    expect(body).toMatchObject({ error: { code: 'validation_failed' } })
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('PUT rejects an unknown domain with 404 before touching the service', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never)
    vi.mocked(getRouterParam).mockReturnValue('nope')
    vi.mocked(readBody).mockResolvedValue({})
    const updateDomain = vi.fn()
    vi.mocked(createSettingsServiceForEvent).mockReturnValue({ updateDomain } as never)
    const event = makeEvent()

    const body = await (putRoute as Handler)(event)

    expect(event.node.res.statusCode).toBe(404)
    expect(body).toMatchObject({ error: { code: 'invalid_domain' } })
    expect(updateDomain).not.toHaveBeenCalled()
  })

  it('PUT maps invalid input to a 400 validation_failed error', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never)
    vi.mocked(getRouterParam).mockReturnValue('site')
    vi.mocked(readBody).mockResolvedValue({ siteName: '' })
    const updateDomain = vi.fn()
    vi.mocked(createSettingsServiceForEvent).mockReturnValue({ updateDomain } as never)
    const event = makeEvent()

    const body = await (putRoute as Handler)(event)

    expect(event.node.res.statusCode).toBe(400)
    expect(body).toMatchObject({ error: { code: 'validation_failed' } })
    expect(updateDomain).not.toHaveBeenCalled()
  })

  it('PUT rejects Nocturne as a persisted light-theme choice', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({} as never)
    vi.mocked(getRouterParam).mockReturnValue('site')
    vi.mocked(readBody).mockResolvedValue({ siteName: 'TBLOG', lightTheme: 'nocturne' })
    const updateDomain = vi.fn()
    vi.mocked(createSettingsServiceForEvent).mockReturnValue({ updateDomain } as never)
    const event = makeEvent()

    const body = await (putRoute as Handler)(event)

    expect(event.node.res.statusCode).toBe(400)
    expect(body).toMatchObject({ error: { code: 'validation_failed' } })
    expect(updateDomain).not.toHaveBeenCalled()
  })
})
