import type { ProcessingState } from '../../domain/content'

export interface PostContentProcessingRecord {
  postId: string
  markdown: string
  html: string | null
  tocJson: string | null
  customExcerpt: string | null
  excerpt: string | null
  readingTime: number
  plainTextSearchBody: string | null
  codeMetaJson: string | null
  processorVersion: string | null
  processingState: ProcessingState
  processingError: string | null
  processedAt: Date | null
}

export interface SaveProcessedContentInput {
  postId: string
  markdown: string
  html: string
  tocJson: string
  customExcerpt: string | null
  excerpt: string
  readingTime: number
  plainTextSearchBody: string
  codeMetaJson: string
  processorVersion: string
  processedAt: Date
}

export interface MarkProcessingFailedInput {
  postId: string
  markdown: string
  customExcerpt: string | null
  processingError: string
}

export interface PostContentRepository {
  findProcessingRecord(postId: string): Promise<PostContentProcessingRecord | null>
  saveProcessedContent(input: SaveProcessedContentInput): Promise<PostContentProcessingRecord>
  markProcessingFailed(input: MarkProcessingFailedInput): Promise<PostContentProcessingRecord>
}
