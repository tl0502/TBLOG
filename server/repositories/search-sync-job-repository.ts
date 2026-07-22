import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  lte,
  or,
  sql
} from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { searchSyncJobs } from '../database/schema'
import type {
  SearchSyncJob,
  SearchSyncJobRepository
} from './contracts/search-sync-repositories'

export function createSearchSyncJobRepository(db: AppDatabase): SearchSyncJobRepository {
  return {
    async enqueue(input) {
      await db
        .insert(searchSyncJobs)
        .values({
          id: crypto.randomUUID(),
          providerKey: input.providerKey,
          postId: input.postId,
          operation: input.operation,
          status: 'pending',
          attemptCount: 0,
          revision: 1,
          availableAt: input.availableAt,
          leaseOwner: null,
          lockedUntil: null,
          lastError: null,
          updatedAt: input.updatedAt
        })
        .onConflictDoUpdate({
          target: [searchSyncJobs.providerKey, searchSyncJobs.postId],
          set: {
            operation: input.operation,
            status: 'pending',
            attemptCount: 0,
            revision: sql`${searchSyncJobs.revision} + 1`,
            availableAt: input.availableAt,
            leaseOwner: null,
            lockedUntil: null,
            lastError: null,
            updatedAt: input.updatedAt
          }
        })
    },

    async claim(input): Promise<SearchSyncJob[]> {
      const claimableIds = db
        .select({ id: searchSyncJobs.id })
        .from(searchSyncJobs)
        .where(and(
          eq(searchSyncJobs.providerKey, input.providerKey),
          eq(searchSyncJobs.status, 'pending'),
          lte(searchSyncJobs.availableAt, input.now),
          or(isNull(searchSyncJobs.lockedUntil), lte(searchSyncJobs.lockedUntil, input.now))
        ))
        .orderBy(asc(searchSyncJobs.availableAt), asc(searchSyncJobs.createdAt), asc(searchSyncJobs.id))
        .limit(input.limit)

      return db
        .update(searchSyncJobs)
        .set({
          leaseOwner: input.ownerToken,
          lockedUntil: input.lockedUntil,
          updatedAt: input.now
        })
        .where(inArray(searchSyncJobs.id, claimableIds))
        .returning()
    },

    async complete(input) {
      const rows = await db
        .delete(searchSyncJobs)
        .where(and(
          eq(searchSyncJobs.id, input.id),
          eq(searchSyncJobs.leaseOwner, input.ownerToken),
          eq(searchSyncJobs.revision, input.revision)
        ))
        .returning({ id: searchSyncJobs.id })
      return rows.length > 0
    },

    async fail(input) {
      const rows = await db
        .update(searchSyncJobs)
        .set({
          status: input.status,
          attemptCount: input.attemptCount,
          availableAt: input.availableAt,
          leaseOwner: null,
          lockedUntil: null,
          lastError: input.lastError,
          updatedAt: input.updatedAt
        })
        .where(and(
          eq(searchSyncJobs.id, input.id),
          eq(searchSyncJobs.leaseOwner, input.ownerToken),
          eq(searchSyncJobs.revision, input.revision)
        ))
        .returning({ id: searchSyncJobs.id })
      return rows.length > 0
    },

    async clearPost(providerKey, postId, operation) {
      await db.delete(searchSyncJobs).where(and(
        eq(searchSyncJobs.providerKey, providerKey),
        eq(searchSyncJobs.postId, postId),
        eq(searchSyncJobs.operation, operation)
      ))
    },

    async clearProvider(providerKey) {
      await db.delete(searchSyncJobs).where(eq(searchSyncJobs.providerKey, providerKey))
    },

    async countByProvider(providerKey) {
      const rows = await db
        .select({ status: searchSyncJobs.status, total: count() })
        .from(searchSyncJobs)
        .where(eq(searchSyncJobs.providerKey, providerKey))
        .groupBy(searchSyncJobs.status)
      return rows.reduce(
        (totals, row) => ({ ...totals, [row.status]: row.total }),
        { pending: 0, dead: 0 }
      )
    }
  }
}
