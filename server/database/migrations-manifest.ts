import type { EmbeddedMigration } from '../repositories/contracts/migration-repository'
import { embeddedMigrations } from './migrations-manifest.generated'

export type { EmbeddedMigration }

// The migration SQL is embedded at build time by scripts/generate-migrations-manifest.mjs into
// migrations-manifest.generated.ts (a plain committed-free TS array). This avoids import.meta.glob,
// which is a Vite-only transform unavailable in Nitro's server runtime.
export const migrationsManifest: ReadonlyArray<EmbeddedMigration> = embeddedMigrations
