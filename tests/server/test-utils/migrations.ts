import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function readGeneratedMigrationSql(): string {
  const migrationsDir = join(process.cwd(), 'server/database/migrations')

  if (!existsSync(migrationsDir)) {
    throw new Error('Migration directory does not exist')
  }

  const sqlFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  if (sqlFiles.length === 0) {
    throw new Error('No generated SQL migration files found')
  }

  return sqlFiles
    .map((file) => readFileSync(join(migrationsDir, file), 'utf8'))
    .join('\n')
}
