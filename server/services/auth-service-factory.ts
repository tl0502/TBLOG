import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createAdminSecurityRepository } from '../repositories/admin-security-repository'
import { createAdministratorRepository } from '../repositories/administrator-repository'
import { createSessionRepository } from '../repositories/session-repository'
import { resolveAuthRuntimeSecrets } from '../utils/auth-runtime-secrets'
import { createAuthService } from './auth-service'

export function createAuthServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)
  const secrets = resolveAuthRuntimeSecrets(process.env, event.context.cloudflare?.env)

  return createAuthService({
    administratorRepository: createAdministratorRepository(db),
    sessionRepository: createSessionRepository(db),
    securityRepository: createAdminSecurityRepository(db),
    sessionSecret: secrets.sessionSecret,
    authEncryptionKey: secrets.authEncryptionKey
  })
}
