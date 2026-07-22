import { contentProcessorVersion } from '../../../server/content/markdown-processor'
import type {
  PostContentProcessingRecord,
  PostContentRepository
} from '../../../server/repositories/contracts/content-repositories'
import { createContentProcessingService } from '../../../server/services/content-processing-service'

function createFakeRepository(initial?: PostContentProcessingRecord) {
  let record = initial ?? null

  const repository: PostContentRepository = {
    async findProcessingRecord(postId) {
      return record?.postId === postId ? record : null
    },
    async saveProcessedContent(input) {
      record = {
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
      }
      return record
    },
    async markProcessingFailed(input) {
      record = {
        postId: input.postId,
        markdown: input.markdown,
        html: record?.html ?? null,
        tocJson: record?.tocJson ?? null,
        customExcerpt: input.customExcerpt,
        excerpt: record?.excerpt ?? null,
        readingTime: record?.readingTime ?? 0,
        plainTextSearchBody: record?.plainTextSearchBody ?? null,
        codeMetaJson: record?.codeMetaJson ?? null,
        processorVersion: record?.processorVersion ?? null,
        processingState: 'failed',
        processingError: input.processingError,
        processedAt: record?.processedAt ?? null
      }
      return record
    }
  }

  return { repository, getRecord: () => record }
}

describe('content processing service', () => {
  it('processes markdown and stores processed output', async () => {
    const fake = createFakeRepository()
    const service = createContentProcessingService({
      postContentRepository: fake.repository,
      now: () => new Date('2026-06-27T00:00:00.000Z')
    })

    await service.processAndStore({ postId: 'post-1', markdown: '## Hello\n\nBody' })

    expect(fake.getRecord()).toMatchObject({
      postId: 'post-1',
      processingState: 'processed',
      processorVersion: contentProcessorVersion,
      processingError: null
    })
    expect(fake.getRecord()?.html).toContain('id="hello"')
  })

  it('prefers a trimmed custom excerpt over the generated excerpt', async () => {
    const fake = createFakeRepository()
    const service = createContentProcessingService({ postContentRepository: fake.repository })

    await service.processAndStore({
      postId: 'post-1',
      markdown: 'Generated body excerpt',
      customExcerpt: '  Deliberate summary  '
    })

    expect(fake.getRecord()).toMatchObject({
      customExcerpt: 'Deliberate summary',
      excerpt: 'Deliberate summary'
    })
  })

  it('clears a whitespace-only custom excerpt and restores generated fallback', async () => {
    const fake = createFakeRepository()
    const service = createContentProcessingService({ postContentRepository: fake.repository })

    await service.processAndStore({
      postId: 'post-1',
      markdown: 'Generated body excerpt',
      customExcerpt: '   '
    })

    expect(fake.getRecord()).toMatchObject({
      customExcerpt: null,
      excerpt: 'Generated body excerpt'
    })
  })

  it('stores failed state while preserving existing valid output', async () => {
    const fake = createFakeRepository({
      postId: 'post-1',
      markdown: '## Old',
      html: '<h2 id="old">Old</h2>',
      tocJson: '[]',
      customExcerpt: null,
      excerpt: 'Old',
      readingTime: 1,
      plainTextSearchBody: 'Old',
      codeMetaJson: '[]',
      processorVersion: contentProcessorVersion,
      processingState: 'processed',
      processingError: null,
      processedAt: new Date('2026-06-27T00:00:00.000Z')
    })
    const service = createContentProcessingService({
      postContentRepository: fake.repository,
      markdownProcessor: async () => {
        throw new Error('Broken markdown')
      }
    })

    await expect(service.processAndStore({ postId: 'post-1', markdown: '<broken>' }))
      .resolves.toMatchObject({ processingState: 'failed' })
    expect(fake.getRecord()).toMatchObject({
      markdown: '<broken>',
      html: '<h2 id="old">Old</h2>',
      processorVersion: contentProcessorVersion,
      processingState: 'failed',
      processingError: 'Broken markdown'
    })
  })

  it('throws and stores failed state when processing fails with no prior valid output', async () => {
    const fake = createFakeRepository()
    const service = createContentProcessingService({
      postContentRepository: fake.repository,
      markdownProcessor: async () => {
        throw new Error('Broken markdown')
      }
    })

    await expect(service.processAndStore({ postId: 'post-1', markdown: '<broken>' }))
      .rejects.toMatchObject({ code: 'content_processing_failed', statusCode: 422 })
    expect(fake.getRecord()).toMatchObject({
      postId: 'post-1',
      html: null,
      processingState: 'failed',
      processingError: 'Broken markdown'
    })
  })

  it('requires current processed output before publish', async () => {
    const fake = createFakeRepository({
      postId: 'post-1',
      markdown: '## Hello',
      html: '<h2 id="hello">Hello</h2>',
      tocJson: '[]',
      customExcerpt: null,
      excerpt: 'Hello',
      readingTime: 1,
      plainTextSearchBody: 'Hello',
      codeMetaJson: '[]',
      processorVersion: contentProcessorVersion,
      processingState: 'processed',
      processingError: null,
      processedAt: new Date('2026-06-27T00:00:00.000Z')
    })
    const service = createContentProcessingService({ postContentRepository: fake.repository })

    await expect(service.assertPublishableProcessedOutput('post-1')).resolves.toBeUndefined()
  })

  it('rejects missing, failed, and stale processed output before publish', async () => {
    const missing = createContentProcessingService({ postContentRepository: createFakeRepository().repository })
    await expect(missing.assertPublishableProcessedOutput('post-1'))
      .rejects.toMatchObject({ code: 'processed_content_required', statusCode: 409 })

    const failed = createContentProcessingService({
      postContentRepository: createFakeRepository({
        postId: 'post-1',
        markdown: '## Hello',
        html: null,
        tocJson: null,
        customExcerpt: null,
        excerpt: null,
        readingTime: 0,
        plainTextSearchBody: null,
        codeMetaJson: null,
        processorVersion: null,
        processingState: 'failed',
        processingError: 'Invalid markdown',
        processedAt: null
      }).repository
    })
    await expect(failed.assertPublishableProcessedOutput('post-1'))
      .rejects.toMatchObject({ code: 'processed_content_required', statusCode: 409 })

    const stale = createContentProcessingService({
      postContentRepository: createFakeRepository({
        postId: 'post-1',
        markdown: '## Hello',
        html: '<h2 id="hello">Hello</h2>',
        tocJson: '[]',
        customExcerpt: null,
        excerpt: 'Hello',
        readingTime: 1,
        plainTextSearchBody: 'Hello',
        codeMetaJson: '[]',
        processorVersion: 'old-version',
        processingState: 'processed',
        processingError: null,
        processedAt: new Date('2026-06-27T00:00:00.000Z')
      }).repository
    })
    await expect(stale.assertPublishableProcessedOutput('post-1'))
      .rejects.toMatchObject({ code: 'processed_content_required', statusCode: 409 })
  })

  it('previews markdown to html without persisting', async () => {
    const fake = createFakeRepository()
    const service = createContentProcessingService({ postContentRepository: fake.repository })

    const result = await service.previewMarkdown('# Title\n\nBody')

    expect(result.html).toContain('Title')
    expect(fake.getRecord()).toBeNull()
  })
})
