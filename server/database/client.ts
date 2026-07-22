import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import type { H3Event } from 'h3'
import * as schema from './schema'

export type AppDatabase = DrizzleD1Database<typeof schema>

export function createDatabaseClient(binding: D1Database): AppDatabase {
  if (!binding) {
    throw new Error('D1 binding DB is not available')
  }

  return drizzle(binding, { schema })
}

export function getDatabaseClient(event: H3Event): AppDatabase {
  const binding = event.context.cloudflare?.env?.DB

  if (!binding) {
    throw new Error('D1 binding DB is not available')
  }

  return createDatabaseClient(binding)
}
