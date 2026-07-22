import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { postContent } from '../database/schema'
import type {
  MarkProcessingFailedInput,
  PostContentProcessingRecord,
  PostContentRepository,
  SaveProcessedContentInput
} from './contracts/content-repositories'

function toProcessingRecord(row: typeof postContent.$inferSelect): PostContentProcessingRecord {
  return {
    postId: row.postId,
    markdown: row.markdown,
    html: row.html,
    tocJson: row.tocJson,
    customExcerpt: row.customExcerpt,
    excerpt: row.excerpt,
    readingTime: row.readingTime,
    plainTextSearchBody: row.plainTextSearchBody,
    codeMetaJson: row.codeMetaJson,
    processorVersion: row.processorVersion,
    processingState: row.processingState,
    processingError: row.processingError,
    processedAt: row.processedAt
  }
}

export function createPostContentRepository(db: AppDatabase): PostContentRepository {
  return {
    async findProcessingRecord(postId) {
      const row = await db.query.postContent.findFirst({
        where: eq(postContent.postId, postId)
      })

      return row ? toProcessingRecord(row) : null
    },

    async saveProcessedContent(input: SaveProcessedContentInput) {
      const [row] = await db
        .insert(postContent)
        .values({
          postId: input.postId,
          markdown: input.markdown,
          html: input.html,
          tocJson: input.tocJson,
          customExcerpt: input.customExcerpt,
          excerpt: input.excerpt,
          readingTime: input.readingTime,
          plainTextSearchBody: input.plainTextSearchBody,
          codeMetaJson: input.codeMetaJson,
          processorVersion: input.processorVersion,
          processingState: 'processed',
          processingError: null,
          processedAt: input.processedAt
        })
        .onConflictDoUpdate({
          target: postContent.postId,
          set: {
            markdown: input.markdown,
            html: input.html,
            tocJson: input.tocJson,
            customExcerpt: input.customExcerpt,
            excerpt: input.excerpt,
            readingTime: input.readingTime,
            plainTextSearchBody: input.plainTextSearchBody,
            codeMetaJson: input.codeMetaJson,
            processorVersion: input.processorVersion,
            processingState: 'processed',
            processingError: null,
            processedAt: input.processedAt
          }
        })
        .returning()

      return toProcessingRecord(row)
    },

    async markProcessingFailed(input: MarkProcessingFailedInput) {
      const [row] = await db
        .insert(postContent)
        .values({
          postId: input.postId,
          markdown: input.markdown,
          customExcerpt: input.customExcerpt,
          processingState: 'failed',
          processingError: input.processingError
        })
        .onConflictDoUpdate({
          target: postContent.postId,
          set: {
            markdown: input.markdown,
            customExcerpt: input.customExcerpt,
            processingState: 'failed',
            processingError: input.processingError
          }
        })
        .returning()

      return toProcessingRecord(row)
    }
  }
}
