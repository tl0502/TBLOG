import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { createHealthRepository } from '../repositories/health-repository'
import { createHealthService } from './health-service'

export function createHealthServiceForEvent(event: H3Event) {
  return createHealthService({
    // Resolve the binding inside the service-owned probe so a missing/unreachable D1 dependency is
    // normalized to the same safe readiness error as a failed query.
    healthRepository: {
      async probe() {
        await createHealthRepository(getDatabaseClient(event)).probe()
      }
    }
  })
}
