import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineNuxtRouteMiddleware = (handler: unknown) => handler
})

import adminMiddleware from '../../middleware/admin'

type Route = {
  path: string
  fullPath: string
  query: Record<string, unknown>
}

const route = (path: string, query: Record<string, unknown> = {}): Route => ({
  path,
  fullPath: path,
  query
})

beforeEach(() => {
  vi.stubGlobal('navigateTo', vi.fn((target) => target))
  vi.stubGlobal('fetchAdminMe', vi.fn().mockResolvedValue({
    data: { administrator: { username: 'editor' }, permissions: ['posts:read'] }
  }))
  vi.stubGlobal('fetchAdminSetupStatus', vi.fn())
  vi.stubGlobal('setAdminSessionSnapshot', vi.fn())
  vi.stubGlobal('clearAdminSessionSnapshot', vi.fn())
  vi.stubGlobal('useNuxtApp', () => ({ isHydrating: false, payload: { serverRendered: true } }))
  vi.stubGlobal('useAdminSessionSnapshot', () => shallowRef(null))
})

describe('admin route middleware', () => {
  it('stores the authoritative session without probing setup on a protected route', async () => {
    await (adminMiddleware as never as (to: Route) => Promise<unknown>)(route('/admin/posts'))

    expect(fetchAdminMe).toHaveBeenCalledOnce()
    expect(setAdminSessionSnapshot).toHaveBeenCalledWith({
      administrator: { username: 'editor' },
      permissions: ['posts:read']
    })
    expect(fetchAdminSetupStatus).not.toHaveBeenCalled()
  })

  it('reuses a server-rendered snapshot during client hydration only', async () => {
    vi.stubGlobal('useNuxtApp', () => ({ isHydrating: true, payload: { serverRendered: true } }))
    vi.stubGlobal('useAdminSessionSnapshot', () => shallowRef({
      administrator: { username: 'editor' }, permissions: ['posts:read']
    }))

    await (adminMiddleware as never as (to: Route) => Promise<unknown>)(route('/admin/posts'))

    expect(fetchAdminMe).not.toHaveBeenCalled()
    expect(fetchAdminSetupStatus).not.toHaveBeenCalled()
    expect(setAdminSessionSnapshot).not.toHaveBeenCalled()
  })

  it('routes a fresh deployment to setup while allowing the setup page itself', async () => {
    vi.stubGlobal('fetchAdminMe', vi.fn().mockRejectedValue({ statusCode: 401 }))
    vi.stubGlobal('fetchAdminSetupStatus', vi.fn().mockResolvedValue({ data: { required: true } }))

    await (adminMiddleware as never as (to: Route) => Promise<unknown>)(route('/admin/posts'))
    expect(navigateTo).toHaveBeenCalledWith('/admin/setup?redirect=%2Fadmin%2Fposts')
    expect(clearAdminSessionSnapshot).toHaveBeenCalledOnce()

    vi.mocked(navigateTo).mockClear()
    await (adminMiddleware as never as (to: Route) => Promise<unknown>)(route('/admin/setup'))
    expect(navigateTo).not.toHaveBeenCalled()
    expect(fetchAdminMe).toHaveBeenCalledOnce()
  })

  it('preserves the original admin destination when login is redirected to setup', async () => {
    vi.stubGlobal('fetchAdminSetupStatus', vi.fn().mockResolvedValue({ data: { required: true } }))

    await (adminMiddleware as never as (to: Route) => Promise<unknown>)(
      route('/admin/login', { redirect: '/admin/posts/new' })
    )

    expect(navigateTo).toHaveBeenCalledWith('/admin/setup?redirect=%2Fadmin%2Fposts%2Fnew')
  })

  it('routes setup to login after initialization without creating a redirect loop', async () => {
    vi.stubGlobal('fetchAdminSetupStatus', vi.fn().mockResolvedValue({ data: { required: false } }))

    await (adminMiddleware as never as (to: Route) => Promise<unknown>)(
      route('/admin/setup', { redirect: '/admin/posts' })
    )

    expect(navigateTo).toHaveBeenCalledWith('/admin/login?redirect=%2Fadmin%2Fposts')
  })

  it('sends an anonymous initialized administrator to login', async () => {
    vi.stubGlobal('fetchAdminSetupStatus', vi.fn().mockResolvedValue({ data: { required: false } }))
    vi.stubGlobal('fetchAdminMe', vi.fn().mockRejectedValue({
      data: { error: { code: 'unauthorized' } }
    }))

    await (adminMiddleware as never as (to: Route) => Promise<unknown>)(route('/admin'))

    expect(navigateTo).toHaveBeenCalledWith('/admin/login?redirect=%2Fadmin')
    expect(clearAdminSessionSnapshot).toHaveBeenCalledOnce()
  })

  it('routes an uninitialized deployment to setup when the session secret is missing', async () => {
    vi.stubGlobal('fetchAdminMe', vi.fn().mockRejectedValue({
      statusCode: 500,
      data: { error: { code: 'missing_session_secret' } }
    }))
    vi.stubGlobal('fetchAdminSetupStatus', vi.fn().mockResolvedValue({ data: { required: true } }))

    await (adminMiddleware as never as (to: Route) => Promise<unknown>)(route('/admin'))

    expect(navigateTo).toHaveBeenCalledWith('/admin/setup?redirect=%2Fadmin')
    expect(clearAdminSessionSnapshot).toHaveBeenCalledOnce()
  })

  it('surfaces a session configuration error after setup has completed', async () => {
    const error = {
      statusCode: 500,
      data: { error: { code: 'missing_session_secret' } }
    }
    vi.stubGlobal('fetchAdminMe', vi.fn().mockRejectedValue(error))
    vi.stubGlobal('fetchAdminSetupStatus', vi.fn().mockResolvedValue({ data: { required: false } }))

    await expect(
      (adminMiddleware as never as (to: Route) => Promise<unknown>)(route('/admin'))
    ).rejects.toBe(error)

    expect(navigateTo).not.toHaveBeenCalled()
    expect(clearAdminSessionSnapshot).toHaveBeenCalledOnce()
  })

  it('recognizes an invalid session secret from the response payload during first setup', async () => {
    vi.stubGlobal('fetchAdminMe', vi.fn().mockRejectedValue({
      statusCode: 500,
      response: { _data: { error: { code: 'invalid_session_secret' } } }
    }))
    vi.stubGlobal('fetchAdminSetupStatus', vi.fn().mockResolvedValue({ data: { required: true } }))

    await (adminMiddleware as never as (to: Route) => Promise<unknown>)(route('/admin'))

    expect(navigateTo).toHaveBeenCalledWith('/admin/setup?redirect=%2Fadmin')
  })

  it('surfaces a setup-status failure instead of disguising it as a login redirect', async () => {
    const setupError = new Error('setup status unavailable')
    const error = {
      statusCode: 500,
      data: { error: { code: 'invalid_session_secret' } }
    }
    vi.stubGlobal('fetchAdminMe', vi.fn().mockRejectedValue(error))
    vi.stubGlobal('fetchAdminSetupStatus', vi.fn().mockRejectedValue(setupError))

    await expect(
      (adminMiddleware as never as (to: Route) => Promise<unknown>)(route('/admin'))
    ).rejects.toBe(error)

    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('sends a normal unauthorized response to login when setup status is unavailable', async () => {
    const error = { statusCode: 401 }
    vi.stubGlobal('fetchAdminMe', vi.fn().mockRejectedValue(error))
    vi.stubGlobal('fetchAdminSetupStatus', vi.fn().mockRejectedValue(new Error('status unavailable')))

    await (adminMiddleware as never as (to: Route) => Promise<unknown>)(route('/admin'))

    expect(navigateTo).toHaveBeenCalledWith('/admin/login?redirect=%2Fadmin')
  })

  it.each([
    { label: 'IP denial', error: { statusCode: 403, data: { error: { code: 'ip_access_denied' } } } },
    { label: 'server failure', error: { statusCode: 500 } },
    { label: 'network failure', error: new Error('network unavailable') }
  ])('fails closed on $label without probing setup', async ({ error }) => {
    vi.stubGlobal('fetchAdminMe', vi.fn().mockRejectedValue(error))

    await expect(
      (adminMiddleware as never as (to: Route) => Promise<unknown>)(route('/admin/posts'))
    ).rejects.toBe(error)

    expect(clearAdminSessionSnapshot).toHaveBeenCalledOnce()
    expect(fetchAdminSetupStatus).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it.each(['/admin/login', '/admin/setup'])('keeps %s reachable during setup-status outage', async (path) => {
    vi.stubGlobal('fetchAdminSetupStatus', vi.fn().mockRejectedValue(new Error('outage')))

    await (adminMiddleware as never as (to: Route) => Promise<unknown>)(route(path))

    expect(fetchAdminMe).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })
})
