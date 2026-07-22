import { getRequestHeader, getRequestURL } from 'h3'
import type { H3Event } from 'h3'
import { authError } from '../domain/auth-errors'

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function requestMethod(event: H3Event): string {
  const candidate = event as H3Event & { method?: string; node?: { req?: { method?: string } } }
  return (candidate.method ?? candidate.node?.req?.method ?? 'GET').toUpperCase()
}

function denyCrossSiteRequest(): never {
  throw authError(
    'invalid_request_origin',
    'Cross-site administrator requests are not allowed',
    403
  )
}

/**
 * Browser CSRF guard for administrator mutations. Browsers supply Origin and/or Fetch Metadata;
 * non-browser deployment tooling supplies neither and remains usable without a CSRF token.
 */
export function assertAdminRequestOrigin(event: H3Event): void {
  if (!unsafeMethods.has(requestMethod(event))) return

  const origin = getRequestHeader(event, 'origin')
  if (origin !== undefined) {
    try {
      if (origin === 'null' || new URL(origin).origin !== getRequestURL(event).origin) {
        denyCrossSiteRequest()
      }
      return
    } catch (error) {
      if ((error as { code?: string }).code === 'invalid_request_origin') throw error
      denyCrossSiteRequest()
    }
  }

  const fetchSite = getRequestHeader(event, 'sec-fetch-site')?.toLowerCase()
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') denyCrossSiteRequest()
}
