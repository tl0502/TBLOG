import type { H3Event } from 'h3'
import { createAuthServiceForEvent } from '../services/auth-service-factory'
import { createAdminSecurityServiceForEvent } from '../services/admin-security-service-factory'
import { resolveAdminRequestIp } from './admin-request-ip'
import { assertAdminRequestOrigin } from './admin-request-origin'
import { getSessionCookie } from './session-cookie'

/**
 * Single admin guard for `/api/v1/admin/*` endpoints: resolves the current administrator from the
 * session cookie or throws the `unauthorized` (401) domain error. Compose this at the top of every
 * admin handler so a new endpoint cannot silently miss the check.
 */
export async function requireAdmin(event: H3Event) {
  assertAdminRequestOrigin(event)
  const current = await createAuthServiceForEvent(event).getCurrentAdministrator(getSessionCookie(event))
  await createAdminSecurityServiceForEvent(event).assertIpAllowed(resolveAdminRequestIp(event))
  return current
}
