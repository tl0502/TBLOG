export interface HealthRepository {
  probe(): Promise<void>
}
