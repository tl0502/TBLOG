import { contentProcessorVersion, processMarkdown } from '../../../server/content/markdown-processor'

describe('markdown processor', () => {
  it('generates sanitized html, toc, excerpt, reading time, and plain text', async () => {
    const result = await processMarkdown(`# Title

## First Section

Hello **world**.

<script>alert("xss")</script>

[safe](https://example.com)
[unsafe](javascript:alert(1))
`)

    expect(result.processorVersion).toBe(contentProcessorVersion)
    expect(result.html).toContain('id="first-section"')
    expect(result.html).toContain('<strong>world</strong>')
    expect(result.html).not.toContain('<script')
    expect(result.html).not.toContain('javascript:')
    expect(result.toc).toEqual([{ id: 'first-section', depth: 2, text: 'First Section' }])
    expect(result.excerpt).toBe('Title First Section Hello world. safe unsafe')
    expect(result.readingTime).toBe(1)
    expect(result.plainTextSearchBody).toContain('Hello world')
  })

  it('stores code metadata and emits highlighted code html', async () => {
    const result = await processMarkdown('```ts title="app.ts" {1} collapse\nconst value: string = "ok"\n```')

    expect(result.codeMeta).toEqual([
      {
        index: 0,
        language: 'ts',
        filename: 'app.ts',
        highlightedLines: [1],
        collapsed: true,
        diff: false
      }
    ])
    expect(result.html).toContain('language-ts')
    expect(result.html).toContain('hljs')
  })

  it('returns empty public fields for blank markdown', async () => {
    const result = await processMarkdown('   ')

    expect(result.html).toBe('')
    expect(result.toc).toEqual([])
    expect(result.excerpt).toBe('')
    expect(result.readingTime).toBe(0)
    expect(result.plainTextSearchBody).toBe('')
    expect(result.codeMeta).toEqual([])
  })
})
