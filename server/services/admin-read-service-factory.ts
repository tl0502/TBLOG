import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createAdminReadRepository } from '../repositories/admin-read-repository'
import { createAdminDashboardService } from './admin-dashboard-service'

export function createAdminDashboardServiceForEvent(event: H3Event) {
  const db = getDatabaseClient(event)

  return createAdminDashboardService({
    adminReadRepository: createAdminReadRepository(db)
  })
}
