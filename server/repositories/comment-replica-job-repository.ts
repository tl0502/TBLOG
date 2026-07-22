import { and, asc, eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { commentReplicaJobs } from '../database/schema'
import type { CommentReplicaJobRepository } from './contracts/comment-replica-repositories'

export function createCommentReplicaJobRepository(db: AppDatabase): CommentReplicaJobRepository {
  return {
    listProviderJobs(providerKey, limit) {
      return db.select({ id: commentReplicaJobs.id, payloadJson: commentReplicaJobs.payloadJson, revision: commentReplicaJobs.revision, attempts: commentReplicaJobs.attempts })
        .from(commentReplicaJobs).where(eq(commentReplicaJobs.providerKey, providerKey))
        .orderBy(asc(commentReplicaJobs.updatedAt)).limit(limit)
    },
    async complete(id, revision) { await db.delete(commentReplicaJobs).where(and(eq(commentReplicaJobs.id, id), eq(commentReplicaJobs.revision, revision))) },
    async fail(id, revision, error, now) {
      await db.update(commentReplicaJobs).set({ attempts: sql`${commentReplicaJobs.attempts} + 1`, lastError: error, updatedAt: now })
        .where(and(eq(commentReplicaJobs.id, id), eq(commentReplicaJobs.revision, revision)))
    }
  }
}
