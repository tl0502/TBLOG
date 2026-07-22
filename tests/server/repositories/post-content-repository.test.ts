import { createPostContentRepository } from '../../../server/repositories/post-content-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

function seedPost(sqlite: ReturnType<typeof createSqliteTestDatabase>['sqlite']) {
  sqlite.prepare(`
    INSERT INTO administrators (id, username, password_hash)
    VALUES ('admin-1', 'admin', 'hash')
  `).run()
  sqlite.prepare(`
    INSERT INTO posts (id, type, status, title, slug, author_id)
    VALUES ('post-1', 'article', 'draft', 'Post', 'post', 'admin-1')
  `).run()
}

describe('post content repository', () => {
  it('inserts and updates processed content fields', async () => {
    const { db, sqlite } = createSqliteTestDatabase()
    seedPost(sqlite)
    const repository = createPostContentRepository(db as never)

    await repository.saveProcessedContent({
      postId: 'post-1',
      markdown: '## Hello',
      html: '<h2 id="hello">Hello</h2>',
      tocJson: '[{"id":"hello","depth":2,"text":"Hello"}]',
      customExcerpt: null,
      excerpt: 'Hello',
      readingTime: 1,
      plainTextSearchBody: 'Hello',
      codeMetaJson: '[]',
      processorVersion: 'content-pipeline-v1',
      processedAt: new Date('2026-06-27T00:00:00.000Z')
    })

    await repository.saveProcessedContent({
      postId: 'post-1',
      markdown: '## Updated',
      html: '<h2 id="updated">Updated</h2>',
      tocJson: '[{"id":"updated","depth":2,"text":"Updated"}]',
      customExcerpt: null,
      excerpt: 'Updated',
      readingTime: 1,
      plainTextSearchBody: 'Updated',
      codeMetaJson: '[]',
      processorVersion: 'content-pipeline-v1',
      processedAt: new Date('2026-06-27T00:01:00.000Z')
    })

    await expect(repository.findProcessingRecord('post-1')).resolves.toMatchObject({
      postId: 'post-1',
      markdown: '## Updated',
      html: '<h2 id="updated">Updated</h2>',
      processingState: 'processed',
      processingError: null
    })
  })

  it('marks processing failure while preserving previous valid output', async () => {
    const { db, sqlite } = createSqliteTestDatabase()
    seedPost(sqlite)
    const repository = createPostContentRepository(db as never)

    await repository.saveProcessedContent({
      postId: 'post-1',
      markdown: '## Old',
      html: '<h2 id="old">Old</h2>',
      tocJson: '[]',
      customExcerpt: null,
      excerpt: 'Old',
      readingTime: 1,
      plainTextSearchBody: 'Old',
      codeMetaJson: '[]',
      processorVersion: 'content-pipeline-v1',
      processedAt: new Date('2026-06-27T00:00:00.000Z')
    })

    await repository.markProcessingFailed({
      postId: 'post-1',
      markdown: 'bad markdown',
      customExcerpt: null,
      processingError: 'Markdown processing failed'
    })

    await expect(repository.findProcessingRecord('post-1')).resolves.toMatchObject({
      postId: 'post-1',
      markdown: 'bad markdown',
      html: '<h2 id="old">Old</h2>',
      processorVersion: 'content-pipeline-v1',
      processingState: 'failed',
      processingError: 'Markdown processing failed'
    })
  })

  it('inserts a failed record when no prior content exists', async () => {
    const { db, sqlite } = createSqliteTestDatabase()
    seedPost(sqlite)
    const repository = createPostContentRepository(db as never)

    await repository.markProcessingFailed({
      postId: 'post-1',
      markdown: 'bad markdown',
      customExcerpt: null,
      processingError: 'Markdown processing failed'
    })

    await expect(repository.findProcessingRecord('post-1')).resolves.toMatchObject({
      postId: 'post-1',
      markdown: 'bad markdown',
      html: null,
      processorVersion: null,
      processingState: 'failed',
      processingError: 'Markdown processing failed'
    })
  })
})
