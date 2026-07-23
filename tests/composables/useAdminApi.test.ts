import { isRef, shallowRef } from 'vue'
import {
  apiErrorMessage,
  adminLogout,
  clearAdminSessionSnapshot,
  disableAdminTwoFactor,
  enableAdminTwoFactor,
  fetchAdminLoginAttempts,
  autoModerateComments,
  deleteComment,
  fetchAdminSetupStatus,
  moderateComment,
  setupAdmin,
  setAdminSessionSnapshot,
  replaceAdminIpRules,
  startAdminTwoFactor,
  updateAdminAccount,
  syncAdminAnalyticsReport,
  updateAdminAnalyticsReportSettings,
  useAdminAnalyticsReportStatus,
  useAdminCommentCounts,
  useAdminComments,
  useAdminSessionSnapshot,
  useAdminTaxonomyOptions,
  useDashboardMetrics
} from '../../composables/useAdminApi'

describe('useAdminApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads taxonomy options from the admin-only endpoint', () => {
    const useFetch = vi.fn()
    vi.stubGlobal('useFetch', useFetch)

    useAdminTaxonomyOptions()

    expect(useFetch).toHaveBeenCalledWith('/api/v1/admin/taxonomy-options')
  })

  it('uses explicit keys and a computed query that tracks reactive source changes', () => {
    const useFetch = vi.fn()
    vi.stubGlobal('useFetch', useFetch)
    const offset = shallowRef(20)
    const query = () => ({ status: 'pending' as const, offset: offset.value, limit: 20 })

    useDashboardMetrics()
    useAdminComments(query)
    useAdminCommentCounts()

    expect(useFetch).toHaveBeenNthCalledWith(1, '/api/v1/admin/dashboard', {
      key: 'admin-dashboard-metrics'
    })
    const commentOptions = useFetch.mock.calls[1]?.[1]
    expect(useFetch.mock.calls[1]?.[0]).toBe('/api/v1/admin/comments')
    expect(commentOptions.key).toBe('admin-comments')
    expect(isRef(commentOptions.query)).toBe(true)
    expect(commentOptions.query.value).toEqual({ status: 'pending', offset: 20, limit: 20 })

    offset.value = 40
    expect(commentOptions.query.value).toEqual({ status: 'pending', offset: 40, limit: 20 })
    expect(useFetch).toHaveBeenNthCalledWith(3, '/api/v1/admin/comments/counts', {
      key: 'admin-comment-counts'
    })
  })

  it('uses the exact moderation endpoints, methods, and bodies', async () => {
    const $fetch = vi.fn().mockResolvedValue({})
    vi.stubGlobal('$fetch', $fetch)

    await moderateComment('comment-1', 'approved')
    await autoModerateComments(['comment-1', 'comment-2'])
    await deleteComment('comment-1')

    expect($fetch).toHaveBeenNthCalledWith(1, '/api/v1/admin/comments/comment-1', {
      method: 'PATCH', body: { status: 'approved' }
    })
    expect($fetch).toHaveBeenNthCalledWith(2, '/api/v1/admin/comments/auto-moderation', {
      method: 'POST', body: { ids: ['comment-1', 'comment-2'] }
    })
    expect($fetch).toHaveBeenNthCalledWith(3, '/api/v1/admin/comments/comment-1', {
      method: 'DELETE'
    })
  })

  it('uses the published analytics report status, settings, and sync endpoints', async () => {
    const useLazyFetch = vi.fn()
    const $fetch = vi.fn().mockResolvedValue({ data: {}, meta: {} })
    vi.stubGlobal('useLazyFetch', useLazyFetch)
    vi.stubGlobal('$fetch', $fetch)

    useAdminAnalyticsReportStatus()
    await updateAdminAnalyticsReportSettings({
      enabled: true, schedule: 'weekly', timeOfDay: '03:00', timezone: 'UTC', dayOfWeek: 'fri'
    })
    await syncAdminAnalyticsReport()

    expect(useLazyFetch).toHaveBeenCalledWith('/api/v1/admin/analytics/reports/status', {
      key: 'admin-analytics-report-status', server: false, immediate: false
    })
    expect($fetch).toHaveBeenNthCalledWith(1, '/api/v1/admin/analytics/reports/settings', {
      method: 'PUT',
      body: { enabled: true, schedule: 'weekly', timeOfDay: '03:00', timezone: 'UTC', dayOfWeek: 'fri' }
    })
    expect($fetch).toHaveBeenNthCalledWith(2, '/api/v1/admin/analytics/reports/sync', { method: 'POST' })
  })

  it('uses the public first-setup status and creation endpoints', async () => {
    const requestFetch = vi.fn().mockResolvedValue({ data: { required: true }, meta: {} })
    const $fetch = vi.fn().mockResolvedValue({ data: { admin: { username: 'owner' } }, meta: {} })
    vi.stubGlobal('useRequestFetch', () => requestFetch)
    vi.stubGlobal('$fetch', $fetch)

    await fetchAdminSetupStatus()
    await setupAdmin({ username: 'owner', password: 'very-secure-password' })

    expect(requestFetch).toHaveBeenCalledWith('/api/v1/admin/setup/status')
    expect($fetch).toHaveBeenCalledWith('/api/v1/admin/setup', {
      method: 'POST',
      body: { username: 'owner', password: 'very-secure-password' }
    })
  })

  it('keeps only the administrator UI projection in request-scoped Nuxt state', () => {
    const state = shallowRef<unknown>(null)
    const useState = vi.fn(() => state)
    vi.stubGlobal('useState', useState)

    setAdminSessionSnapshot({
      administrator: { username: 'editor' },
      permissions: ['posts:read'],
      token: 'must-not-be-stored'
    } as never)

    expect(useState).toHaveBeenCalledWith('admin-session-snapshot', expect.any(Function))
    expect(useAdminSessionSnapshot().value).toEqual({
      administrator: { username: 'editor' },
      permissions: ['posts:read']
    })

    clearAdminSessionSnapshot()
    expect(state.value).toBeNull()
  })

  it('clears the administrator snapshot when logout finishes or fails', async () => {
    const state = shallowRef<unknown>({ administrator: { username: 'editor' }, permissions: [] })
    vi.stubGlobal('useState', vi.fn(() => state))
    const $fetch = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('outage'))
    vi.stubGlobal('$fetch', $fetch)

    await adminLogout()
    expect(state.value).toBeNull()

    state.value = { administrator: { username: 'editor' }, permissions: [] }
    await expect(adminLogout()).rejects.toThrow('outage')
    expect(state.value).toBeNull()
    expect($fetch).toHaveBeenCalledWith('/api/v1/admin/sessions/current', { method: 'DELETE' })
  })

  it('uses the dedicated administrator security endpoints', async () => {
    const $fetch = vi.fn().mockResolvedValue({ data: {}, meta: {} })
    vi.stubGlobal('$fetch', $fetch)

    await updateAdminAccount({ currentPassword: 'current', username: 'owner' })
    await startAdminTwoFactor('current')
    await enableAdminTwoFactor('123456')
    await disableAdminTwoFactor({ currentPassword: 'current', secondFactor: '123456' })
    await replaceAdminIpRules({ allow: ['192.0.2.1'], deny: [] })
    await fetchAdminLoginAttempts(25, 25)

    expect($fetch).toHaveBeenNthCalledWith(1, '/api/v1/admin/security/account', {
      method: 'PUT', body: { currentPassword: 'current', username: 'owner' }
    })
    expect($fetch).toHaveBeenNthCalledWith(2, '/api/v1/admin/security/two-factor/setup', {
      method: 'POST', body: { currentPassword: 'current' }
    })
    expect($fetch).toHaveBeenNthCalledWith(3, '/api/v1/admin/security/two-factor/enable', {
      method: 'POST', body: { code: '123456' }
    })
    expect($fetch).toHaveBeenNthCalledWith(4, '/api/v1/admin/security/two-factor', {
      method: 'DELETE', body: { currentPassword: 'current', secondFactor: '123456' }
    })
    expect($fetch).toHaveBeenNthCalledWith(5, '/api/v1/admin/security/ip-rules', {
      method: 'PUT', body: { allow: ['192.0.2.1'], deny: [] }
    })
    expect($fetch).toHaveBeenNthCalledWith(6, '/api/v1/admin/security/login-attempts', {
      query: { offset: 25, limit: 25 }
    })
  })
})

describe('apiErrorMessage', () => {
  it('returns the API error envelope message when present', () => {
    const error = { data: { error: { code: 'slug_conflict', message: 'Slug "taken" is already in use' } } }

    expect(apiErrorMessage(error, 'fallback')).toBe('Slug "taken" is already in use')
  })

  it('falls back when the error carries no usable envelope message', () => {
    expect(apiErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
    expect(apiErrorMessage({ data: { error: {} } }, 'fallback')).toBe('fallback')
    expect(apiErrorMessage({ data: { error: { message: '   ' } } }, 'fallback')).toBe('fallback')
    expect(apiErrorMessage(undefined, 'fallback')).toBe('fallback')
  })
})
