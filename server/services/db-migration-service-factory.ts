import type { H3Event } from 'h3'
import type { D1Database } from '@cloudflare/workers-types'
import { migrationsManifest } from '../database/migrations-manifest'
import { createD1MigrationRepository } from '../repositories/d1-migration-repository'
import { createDbMigrationService, type DbMigrationService } from './db-migration-service'

export function createDbMigrationServiceForBinding(binding: D1Database): DbMigrationService {
  return createDbMigrationService({
    repository: createD1MigrationRepository(binding),
    manifest: migrationsManifest
  })
}

export function createDbMigrationServiceForEvent(event: H3Event): DbMigrationService {
  const binding = event.context.cloudflare?.env?.DB
  if (!binding) throw new Error('D1 binding DB is not available')
  return createDbMigrationServiceForBinding(binding)
}
