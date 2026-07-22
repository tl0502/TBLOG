import { parseCodeFenceMeta } from '../../../server/content/code-meta'

describe('code fence metadata parser', () => {
  it('parses filename, highlighted lines, collapsed state, and diff marker', () => {
    expect(parseCodeFenceMeta('ts title="server/app.ts" {1,3-4} collapse diff', 0)).toEqual({
      index: 0,
      language: 'ts',
      filename: 'server/app.ts',
      highlightedLines: [1, 3, 4],
      collapsed: true,
      diff: true
    })
  })

  it('supports filename= syntax and keeps missing values explicit', () => {
    expect(parseCodeFenceMeta('bash filename=deploy.sh', 2)).toEqual({
      index: 2,
      language: 'bash',
      filename: 'deploy.sh',
      highlightedLines: [],
      collapsed: false,
      diff: false
    })
  })

  it('ignores invalid line ranges instead of throwing', () => {
    expect(parseCodeFenceMeta('js {a,2-1,5}', 1).highlightedLines).toEqual([5])
  })
})
