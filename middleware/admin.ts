function isUnauthorized(error: unknown): boolean {
  const candidate = error as {
    status?: unknown
    statusCode?: unknown
    response?: { status?: unknown }
    data?: { error?: { code?: unknown } }
  } | null | undefined
  return candidate?.status === 401
    || candidate?.statusCode === 401
    || candidate?.response?.status === 401
    || candidate?.data?.error?.code === 'unauthorized'
}

function isSessionConfigurationError(error: unknown): boolean {
  const candidate = error as {
    data?: { error?: { code?: unknown } }
    response?: { _data?: { error?: { code?: unknown } } }
  } | null | undefined
  const code = candidate?.data?.error?.code ?? candidate?.response?._data?.error?.code
  return code === 'missing_session_secret' || code === 'invalid_session_secret'
}

// Client auth gate for /admin/** routes. Protected routes probe the authoritative session first;
// only an unauthorized response may fall back to first-run detection.
export default defineNuxtRouteMiddleware(async (to) => {
  const requestedRedirect = typeof to.query.redirect === 'string'
    && to.query.redirect.startsWith('/admin')
    && !to.query.redirect.startsWith('//')
    ? to.query.redirect
    : to.fullPath
  const redirect = encodeURIComponent(requestedRedirect)
  const isLogin = to.path === '/admin/login'
  const isSetup = to.path === '/admin/setup'

  if (isLogin || isSetup) {
    try {
      const setup = await fetchAdminSetupStatus()
      if (setup.data.required) {
        if (isSetup) return
        return navigateTo(`/admin/setup?redirect=${redirect}`)
      }
      if (isSetup) {
        return navigateTo(`/admin/login?redirect=${redirect}`)
      }
    } catch {
      // Both pages remain reachable during a setup-status outage. Their write endpoints still
      // enforce whether setup or login is valid.
    }
    return
  }

  const nuxtApp = useNuxtApp()
  const sessionSnapshot = useAdminSessionSnapshot()
  if (nuxtApp.isHydrating && nuxtApp.payload.serverRendered && sessionSnapshot.value) {
    return
  }

  try {
    const me = await fetchAdminMe()
    setAdminSessionSnapshot(me.data)
  } catch (error) {
    clearAdminSessionSnapshot()
    const sessionConfigurationError = isSessionConfigurationError(error)
    if (!isUnauthorized(error) && !sessionConfigurationError) {
      throw error
    }

    try {
      const setup = await fetchAdminSetupStatus()
      if (setup.data.required) {
        return navigateTo(`/admin/setup?redirect=${redirect}`)
      }
    } catch {
      // An anonymous request cannot enter the admin UI when setup status is unavailable.
      if (sessionConfigurationError) {
        throw error
      }
    }
    if (sessionConfigurationError) {
      throw error
    }
    return navigateTo(`/admin/login?redirect=${redirect}`)
  }
})
