import { DomainError } from '../domain/domain-error'
import type { HealthRepository } from '../repositories/contracts/health-repositories'

export function createHealthService(dependencies: { healthRepository: HealthRepository }) {
  return {
    async checkReadiness(): Promise<{ status: 'ok' }> {
      try {
        await dependencies.healthRepository.probe()
      } catch {
        throw new DomainError('service_unavailable', 'Service unavailable', 503)
      }
      return { status: 'ok' }
    }
  }
}

export type HealthService = ReturnType<typeof createHealthService>
