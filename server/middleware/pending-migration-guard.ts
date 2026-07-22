import { getRequestHeader, setResponseStatus, type H3Event } from 'h3'
import type { D1Database } from '@cloudflare/workers-types'
import { createDbMigrationServiceForBinding } from '../services/db-migration-service-factory'

const ALLOW_PREFIXES = ['/api/v1/health', '/api/v1/admin', '/admin', '/_nuxt', '/__nuxt', '/favicon']
let upToDateThisIsolate = false

export function isGuardAllowlisted(path: string): boolean {
  return ALLOW_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix))
}

/** Testable core: returns whether the request should be blocked. Fails closed on confirmed drift, open on transient errors. */
export async function evaluateGuard(binding: D1Database, path: string): Promise<{ blocked: boolean }> {
  if (isGuardAllowlisted(path)) return { blocked: false }
  if (upToDateThisIsolate) return { blocked: false }
  try {
    const service = createDbMigrationServiceForBinding(binding)
    const status = await service.getStatus()
    if (status.pendingCount === 0) {
      upToDateThisIsolate = true
      return { blocked: false }
    }
    return { blocked: true }
  } catch (error) {
    // Confirmed drift is a known-incompatible state: the deployed code and the database schema disagree
    // (database ahead of code, or a corrupted migration history). Serving public traffic against it
    // risks persistent 500s or wrong output, so fail CLOSED (maintenance). Only genuinely unknown or
    // transient failures fail open, so a guard hiccup can never take the whole site down on its own.
    const code = (error as { code?: unknown } | null | undefined)?.code
    if (code === 'migrations_ahead_of_code' || code === 'migration_history_corrupted') {
      return { blocked: true }
    }
    return { blocked: false }
  }
}

export function __resetGuardCacheForTests(): void {
  upToDateThisIsolate = false
}

export default defineEventHandler(async (event: H3Event) => {
  const binding = event.context.cloudflare?.env?.DB
  if (!binding) return
  const { blocked } = await evaluateGuard(binding, event.path)
  if (!blocked) return
  setResponseStatus(event, 503)
  return {
    error: {
      code: 'database_update_required',
      message: 'The site is being updated. Database migrations are pending; an administrator must apply them.',
      details: {},
      requestId: getRequestHeader(event, 'cf-ray') || crypto.randomUUID()
    }
  }
})
