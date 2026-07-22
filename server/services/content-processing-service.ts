import {
  contentProcessorVersion,
  processMarkdown as defaultProcessMarkdown,
  type ProcessedMarkdown
} from '../content/markdown-processor'
import { contentError } from '../domain/content-errors'
import type { PostContentRepository } from '../repositories/contracts/content-repositories'

export interface ContentProcessingServiceDependencies {
  postContentRepository: PostContentRepository
  markdownProcessor?: (markdown: string) => Promise<ProcessedMarkdown>
  now?: () => Date
}

function toSafeProcessingError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Markdown processing failed'
}

export function createContentProcessingService(dependencies: ContentProcessingServiceDependencies) {
  const now = dependencies.now ?? (() => new Date())
  const markdownProcessor = dependencies.markdownProcessor ?? defaultProcessMarkdown

  return {
    async processAndStore(input: { postId: string; markdown: string; customExcerpt?: string | null }) {
      const customExcerpt = input.customExcerpt?.trim() || null
      try {
        const processed = await markdownProcessor(input.markdown)

        return await dependencies.postContentRepository.saveProcessedContent({
          postId: input.postId,
          markdown: input.markdown,
          html: processed.html,
          tocJson: JSON.stringify(processed.toc),
          customExcerpt,
          excerpt: customExcerpt ?? processed.excerpt,
          readingTime: processed.readingTime,
          plainTextSearchBody: processed.plainTextSearchBody,
          codeMetaJson: JSON.stringify(processed.codeMeta),
          processorVersion: processed.processorVersion,
          processedAt: now()
        })
      } catch (error) {
        const failed = await dependencies.postContentRepository.markProcessingFailed({
          postId: input.postId,
          markdown: input.markdown,
          customExcerpt,
          processingError: toSafeProcessingError(error)
        })

        if (!failed.html || failed.processorVersion !== contentProcessorVersion) {
          throw contentError('content_processing_failed', 'Markdown processing failed', 422)
        }

        return failed
      }
    },

    // Render-only preview that reuses the exact pipeline; persists nothing.
    async previewMarkdown(markdown: string) {
      const processed = await markdownProcessor(markdown)
      return { html: processed.html }
    },

    async assertPublishableProcessedOutput(postId: string) {
      const record = await dependencies.postContentRepository.findProcessingRecord(postId)

      if (
        !record
        || record.processingState !== 'processed'
        || !record.html
        || record.processorVersion !== contentProcessorVersion
      ) {
        throw contentError('processed_content_required', 'Valid processed content is required before publishing', 409)
      }
    }
  }
}

export type ContentProcessingService = ReturnType<typeof createContentProcessingService>
