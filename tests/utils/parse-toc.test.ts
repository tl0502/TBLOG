import { parseToc } from '../../utils/parse-toc'

describe('parseToc', () => {
  it('parses a valid toc payload into view items', () => {
    const json = JSON.stringify([
      { id: 'intro', depth: 2, text: 'Intro' },
      { id: 'details', depth: 3, text: 'Details' }
    ])

    expect(parseToc(json)).toEqual([
      { id: 'intro', depth: 2, text: 'Intro' },
      { id: 'details', depth: 3, text: 'Details' }
    ])
  })

  it('returns [] for null or invalid json', () => {
    expect(parseToc(null)).toEqual([])
    expect(parseToc('')).toEqual([])
    expect(parseToc('not json')).toEqual([])
    expect(parseToc('{"not":"an array"}')).toEqual([])
  })

  it('drops malformed entries but keeps well-formed headings', () => {
    const json = JSON.stringify([
      { id: 'ok', depth: 2, text: 'Keep' },
      { id: '', depth: 2, text: 'Empty id' },
      { id: 'bad-depth', depth: 4, text: 'Too deep' },
      { id: 'no-text', depth: 2 },
      null,
      'string'
    ])

    expect(parseToc(json)).toEqual([{ id: 'ok', depth: 2, text: 'Keep' }])
  })
})
