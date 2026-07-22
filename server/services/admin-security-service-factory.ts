import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createAdminSecurityRepository } from '../repositories/admin-security-repository'
import { createAdministratorRepository } from '../repositories/administrator-repository'
import { resolveAuthRuntimeSecrets } from '../utils/auth-runtime-secrets'
import { createAdminSecurityService } from './admin-security-service'

export function createAdminSecurityServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)
  const secrets = resolveAuthRuntimeSecrets(process.env, event.context.cloudflare?.env)

  return createAdminSecurityService({
    administratorRepository: createAdministratorRepository(db),
    securityRepository: createAdminSecurityRepository(db),
    sessionSecret: secrets.sessionSecret,
    authEncryptionKey: secrets.authEncryptionKey
  })
}
