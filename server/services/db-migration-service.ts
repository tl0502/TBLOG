import { DomainError } from '../domain/domain-error'
import type { EmbeddedMigration, MigrationRepository } from '../repositories/contracts/migration-repository'

export interface MigrationStatus {
  currentVersion: number
  latestVersion: number
  appliedCount: number
  pendingCount: number
  applied: string[]
  pending: string[]
}
export interface ApplyResult {
  appliedNow: string[]
  failed?: { migrations: string[]; error: string }
  pending: string[]
  currentVersion: number
  latestVersion: number
  durationMs: number
}
export interface DbMigrationService {
  getStatus(): Promise<MigrationStatus>
  applyPending(): Promise<ApplyResult>
  applySetupBatch(): Promise<ApplyResult>
  isDatabaseUninitialized(): Promise<boolean>
}

export const SETUP_BATCH_STATEMENT_LIMIT = 45

const versionOf = (name: string): number => Number.parseInt(name.slice(0, 4), 10) || 0

export function createDbMigrationService(deps: {
  repository: MigrationRepository
  manifest: ReadonlyArray<EmbeddedMigration>
  now?: () => number
}): DbMigrationService {
  const { repository, manifest } = deps
  const now = deps.now ?? Date.now
  const manifestNames = new Set(manifest.map((m) => m.name))

  async function computeStatus(applied: Set<string>): Promise<MigrationStatus> {
    for (const name of applied) {
      if (!manifestNames.has(name)) {
        throw new DomainError('migrations_ahead_of_code', `Database has migration '${name}' not present in this build`, 409)
      }
    }
    let seenPending = false
    const appliedOrdered: string[] = []
    const pending: string[] = []
    for (const migration of manifest) {
      if (applied.has(migration.name)) {
        if (seenPending) {
          throw new DomainError('migration_history_corrupted', `Migration '${migration.name}' is applied but an earlier migration is not`, 409)
        }
        appliedOrdered.push(migration.name)
      } else {
        seenPending = true
        pending.push(migration.name)
      }
    }
    return {
      currentVersion: appliedOrdered.length ? versionOf(appliedOrdered[appliedOrdered.length - 1]) : 0,
      latestVersion: manifest.length ? versionOf(manifest[manifest.length - 1].name) : 0,
      appliedCount: appliedOrdered.length,
      pendingCount: pending.length,
      applied: appliedOrdered,
      pending
    }
  }

  return {
    async getStatus() {
      await repository.ensureLedger()
      return computeStatus(await repository.appliedNames())
    },

    async applyPending() {
      const startedAt = now()
      await repository.ensureLedger()
      const status = await computeStatus(await repository.appliedNames())
      const appliedNow: string[] = []
      let failed: ApplyResult['failed']
      const pendingByName = new Map(manifest.map((m) => [m.name, m]))

      for (const name of status.pending) {
        const migration = pendingByName.get(name)!
        try {
          await repository.applyOne(migration)
          appliedNow.push(name)
        } catch (error) {
          // Concurrency: another caller may have applied this migration first (UNIQUE conflict rolled
          // this batch back). If it is now recorded, skip and continue; otherwise it is a real failure.
          const applied = await repository.appliedNames()
          if (applied.has(name)) continue
          failed = { migrations: [name], error: error instanceof Error ? error.message : String(error) }
          break
        }
      }

      const finalStatus = await computeStatus(await repository.appliedNames())
      return {
        appliedNow,
        failed,
        pending: finalStatus.pending,
        currentVersion: finalStatus.currentVersion,
        latestVersion: finalStatus.latestVersion,
        durationMs: now() - startedAt
      }
    },

    async applySetupBatch() {
      const startedAt = now()
      await repository.ensureLedger()
      const status = await computeStatus(await repository.appliedNames())
      const pendingByName = new Map(manifest.map((m) => [m.name, m]))
      const selected: EmbeddedMigration[] = []
      let statementTotal = 0

      for (const name of status.pending) {
        const migration = pendingByName.get(name)!
        const cost = repository.statementCount(migration) + 1 // migration SQL plus ledger INSERT
        if (cost > SETUP_BATCH_STATEMENT_LIMIT) {
          throw new DomainError(
            'migration_batch_too_large',
            `Migration '${name}' contains ${cost} statements and cannot be applied in a setup batch`,
            409,
            { name, statementCount: cost, limit: SETUP_BATCH_STATEMENT_LIMIT }
          )
        }
        if (statementTotal + cost > SETUP_BATCH_STATEMENT_LIMIT) break
        selected.push(migration)
        statementTotal += cost
      }

      let failed: ApplyResult['failed']
      let finalApplied: Set<string> | undefined
      let batchApplied = false
      if (selected.length > 0) {
        try {
          await repository.applyBatch(selected)
          batchApplied = true
        } catch (error) {
          finalApplied = await repository.appliedNames()
          failed = {
            migrations: selected.map((migration) => migration.name),
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }

      const finalStatus = await computeStatus(finalApplied ?? await repository.appliedNames())
      return {
        appliedNow: batchApplied ? selected.map((migration) => migration.name) : [],
        failed,
        pending: finalStatus.pending,
        currentVersion: finalStatus.currentVersion,
        latestVersion: finalStatus.latestVersion,
        durationMs: now() - startedAt
      }
    },

    async isDatabaseUninitialized() {
      // Missing administrators table = brand-new empty DB = uninitialized. The "table exists but no
      // administrator row yet" case is handled by authService.getSetupStatus().required in Task 4.
      return !(await repository.tableExists('administrators'))
    }
  }
}
