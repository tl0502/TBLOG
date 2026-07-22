import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createCacheProviderForEvent } from '../providers/cache/cache-provider-factory'
import { createAdminTaxonomyRepository } from '../repositories/admin-taxonomy-repository'
import { createAdminTaxonomyService } from './admin-taxonomy-service'

export function createAdminTaxonomyServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)

  return createAdminTaxonomyService({
    adminTaxonomyRepository: createAdminTaxonomyRepository(db),
    cache: createCacheProviderForEvent(event)
  })
}
