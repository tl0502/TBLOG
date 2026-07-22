export interface EmbeddedMigration {
  name: string
  sql: string
}

export interface MigrationRepository {
  ensureLedger(): Promise<void>
  appliedNames(): Promise<Set<string>>
  tableExists(name: string): Promise<boolean>
  statementCount(migration: EmbeddedMigration): number
  applyOne(migration: EmbeddedMigration): Promise<void>
  applyBatch(migrations: ReadonlyArray<EmbeddedMigration>): Promise<void>
}
