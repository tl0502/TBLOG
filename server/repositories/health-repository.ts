import { sql } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import type { HealthRepository } from './contracts/health-repositories'

export function createHealthRepository(db: AppDatabase): HealthRepository {
  return {
    async probe() {
      await db.run(sql`select 1`)
    }
  }
}
