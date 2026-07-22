import { and, asc, count, desc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { AppDatabase } from '../database/client'
import { commentModerationResults, commentReplicaJobs, comments, posts } from '../database/schema'
import type { CommentRepository } from './contracts/comment-repositories'
import { decodeCursor, encodeCursor } from '../utils/cursor'

export function createCommentRepository(db: AppDatabase): CommentRepository {
  const replyTarget = alias(comments, 'reply_target')

  return {
    async findPublishedArticleBySlug(slug) {
      const [row] = await db
        .select({ id: posts.id, slug: posts.slug, title: posts.title })
        .from(posts)
        .where(and(eq(posts.slug, slug), eq(posts.status, 'published'), eq(posts.type, 'article')))
        .limit(1)

      return row ?? null
    },

    async createComment(input) {
      if (!input.parentCommentId) {
        const { replyTargetId: _replyTargetId, ...record } = input
        const rows = await db.insert(comments).values(record).returning({ id: comments.id })
        return rows.length === 1
      }

      if (!input.replyTargetId) return false

      const rows = await db.insert(comments).select(
        db.select({
          id: sql<string>`${input.id}`.as('id'),
          postId: sql<string>`${input.postId}`.as('post_id'),
          nickname: sql<string>`${input.nickname}`.as('nickname'),
          email: sql<string | null>`${input.email}`.as('email'),
          content: sql<string>`${input.content}`.as('content'),
          parentCommentId: sql<string>`${input.parentCommentId}`.as('parent_comment_id'),
          replyToNickname: replyTarget.nickname,
          status: sql<'pending' | 'approved' | 'rejected'>`${input.status}`.as('status'),
          createdAt: sql<Date>`${input.createdAt.getTime()}`.as('created_at'),
          reviewedAt: sql<Date | null>`${input.reviewedAt?.getTime() ?? null}`.as('reviewed_at')
        })
          .from(comments)
          .innerJoin(replyTarget, and(
            eq(replyTarget.id, input.replyTargetId),
            eq(replyTarget.postId, input.postId),
            eq(replyTarget.status, 'approved'),
            or(eq(replyTarget.id, comments.id), eq(replyTarget.parentCommentId, comments.id))
          ))
          .where(and(
            eq(comments.id, input.parentCommentId),
            eq(comments.postId, input.postId),
            eq(comments.status, 'approved'),
            isNull(comments.parentCommentId)
          ))
      ).returning({ id: comments.id })
      return rows.length === 1
    },

    async findCommentParent(id) {
      const [row] = await db
        .select({ id: comments.id, postId: comments.postId, parentCommentId: comments.parentCommentId, nickname: comments.nickname, status: comments.status })
        .from(comments)
        .where(eq(comments.id, id))
        .limit(1)
      return row ?? null
    },

    async findCommentReplicaSource(id) {
      const [row] = await db.select({
        id: comments.id,
        postId: comments.postId,
        parentCommentId: comments.parentCommentId,
        replyToNickname: comments.replyToNickname,
        nickname: comments.nickname,
        content: comments.content,
        status: comments.status,
        createdAt: comments.createdAt,
        reviewedAt: comments.reviewedAt
      }).from(comments).where(eq(comments.id, id)).limit(1)
      return row ?? null
    },

    listReplicaSourcesForDeletion(id) {
      return db.select({
        id: comments.id, postId: comments.postId, parentCommentId: comments.parentCommentId, replyToNickname: comments.replyToNickname,
        nickname: comments.nickname, content: comments.content, status: comments.status,
        createdAt: comments.createdAt, reviewedAt: comments.reviewedAt
      }).from(comments).where(or(eq(comments.id, id), eq(comments.parentCommentId, id)))
    },

    async getReplicaFailureRevision(providerKey, commentId) {
      const [row] = await db.select({ revision: commentReplicaJobs.revision }).from(commentReplicaJobs)
        .where(and(eq(commentReplicaJobs.providerKey, providerKey), eq(commentReplicaJobs.commentId, commentId))).limit(1)
      return row?.revision ?? null
    },

    async clearReplicaFailure(providerKey, commentId, revision) {
      await db.delete(commentReplicaJobs).where(and(
        eq(commentReplicaJobs.providerKey, providerKey),
        eq(commentReplicaJobs.commentId, commentId),
        eq(commentReplicaJobs.revision, revision)
      ))
    },

    async enqueueReplicaFailure(input) {
      await db.insert(commentReplicaJobs).values({
        id: crypto.randomUUID(),
        providerKey: input.providerKey,
        commentId: input.commentId,
        operation: input.operation,
        payloadJson: input.payloadJson,
        revision: 1,
        attempts: 1,
        lastError: input.error,
        createdAt: input.now,
        updatedAt: input.now
      }).onConflictDoUpdate({
        target: [commentReplicaJobs.providerKey, commentReplicaJobs.commentId],
        set: {
          operation: input.operation,
          payloadJson: input.payloadJson,
          revision: sql`${commentReplicaJobs.revision} + 1`,
          attempts: 1,
          lastError: input.error,
          updatedAt: input.now
        }
      })
    },

    async saveModerationResult(input) {
      const columns = {
        providerKey: input.providerKey,
        decision: input.decision,
        confidence: input.confidence === null ? null : Math.round(input.confidence * 1000),
        categoriesJson: JSON.stringify(input.categories),
        reasonsJson: JSON.stringify(input.reasons),
        providerRequestId: input.providerRequestId,
        modelVersion: input.modelVersion,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt
      }
      await db.insert(commentModerationResults).values({
        commentId: input.commentId,
        ...columns
      }).onConflictDoUpdate({
        target: commentModerationResults.commentId,
        set: columns
      })
    },

    async purgeExpiredModerationResults(now) {
      const rows = await db
        .delete(commentModerationResults)
        .where(inArray(
          commentModerationResults.commentId,
          db.select({ id: commentModerationResults.commentId })
            .from(commentModerationResults)
            .where(lt(commentModerationResults.expiresAt, now))
            .limit(250)
        ))
        .returning({ id: commentModerationResults.commentId })
      return rows.length
    },

    async listApprovedByPostId(postId, query) {
      const conditions: SQL[] = [
        eq(comments.postId, postId),
        eq(comments.status, 'approved'),
        isNull(comments.parentCommentId)
      ]
      const decoded = query.cursor ? decodeCursor(query.cursor) : null
      if (decoded) {
        const cursorDate = new Date(decoded.publishedAtMs)
        const keyset = or(
          gt(comments.createdAt, cursorDate),
          and(eq(comments.createdAt, cursorDate), gt(comments.id, decoded.id))
        )
        if (keyset) conditions.push(keyset)
      }

      const parents = await db
        .select({
          id: comments.id,
          parentCommentId: comments.parentCommentId,
          replyToNickname: comments.replyToNickname,
          nickname: comments.nickname,
          content: comments.content,
          createdAt: comments.createdAt
        })
        .from(comments)
        .where(and(...conditions))
        .orderBy(asc(comments.createdAt), asc(comments.id))
        .limit(query.limit + 1)

      const hasMore = parents.length > query.limit
      const items = hasMore ? parents.slice(0, query.limit) : parents
      const parentIds = items.map((comment) => comment.id)
      const replies = parentIds.length
        ? await db
            .select({
              id: comments.id,
              parentCommentId: comments.parentCommentId,
              replyToNickname: comments.replyToNickname,
              nickname: comments.nickname,
              content: comments.content,
              createdAt: comments.createdAt
            })
            .from(comments)
            .where(and(
              eq(comments.status, 'approved'),
              inArray(comments.parentCommentId, parentIds)
            ))
            .orderBy(asc(comments.parentCommentId), asc(comments.createdAt), asc(comments.id))
        : []
      const last = items[items.length - 1]

      return {
        items: [...items, ...replies],
        nextCursor: hasMore && last
          ? encodeCursor({ publishedAtMs: last.createdAt.getTime(), id: last.id })
          : null
      }
    },

    async listAdminComments(query) {
      const filter = query.status ? eq(comments.status, query.status) : undefined
      const items = await db
        .select({
          id: comments.id,
          parentCommentId: comments.parentCommentId,
          nickname: comments.nickname,
          email: comments.email,
          content: comments.content,
          status: comments.status,
          createdAt: comments.createdAt,
          reviewedAt: comments.reviewedAt,
          post: { id: posts.id, slug: posts.slug, title: posts.title }
        })
        .from(comments)
        .innerJoin(posts, eq(comments.postId, posts.id))
        .where(filter)
        .orderBy(desc(comments.createdAt), desc(comments.id))
        .limit(query.limit)
        .offset(query.offset)

      const [totalRow] = await db.select({ value: count() }).from(comments).where(filter)

      const parentIds = [...new Set(items.flatMap((item) => item.parentCommentId ? [item.parentCommentId] : []))]
      const parentRows = parentIds.length
        ? await db.select({
            id: comments.id,
            nickname: comments.nickname,
            content: comments.content,
            status: comments.status
          }).from(comments).where(inArray(comments.id, parentIds))
        : []
      const parents = new Map(parentRows.map((parent) => [parent.id, parent]))

      return {
        items: items.map((item) => ({
          ...item,
          parent: item.parentCommentId ? parents.get(item.parentCommentId) ?? null : null
        })),
        total: Number(totalRow?.value ?? 0),
        offset: query.offset,
        limit: query.limit
      }
    },

    async findCommentsForAutoModeration(ids) {
      if (ids.length === 0) return []
      return db
        .select({
          id: comments.id,
          parentCommentId: comments.parentCommentId,
          nickname: comments.nickname,
          content: comments.content,
          status: comments.status,
          post: { id: posts.id, slug: posts.slug, title: posts.title }
        })
        .from(comments)
        .innerJoin(posts, eq(comments.postId, posts.id))
        .where(inArray(comments.id, ids))
    },

    async countPendingComments() {
      const [row] = await db
        .select({ value: count() })
        .from(comments)
        .where(eq(comments.status, 'pending'))

      return Number(row?.value ?? 0)
    },

    async updateStatus(id, status, reviewedAt) {
      const rows = await db
        .update(comments)
        .set({ status, reviewedAt })
        .where(eq(comments.id, id))
        .returning({ id: comments.id })

      return rows.length === 1
    },

    async deleteComment(id) {
      const rows = await db.delete(comments).where(eq(comments.id, id)).returning({ id: comments.id })

      return rows.length === 1
    }
  }
}
