import { parseJsonc } from '../../scripts/parse-jsonc.mjs'

describe('parseJsonc', () => {
  it('accepts comments and trailing commas without touching strings', () => {
    expect(parseJsonc(`{
      // comment
      "url": "https://example.test//path",
      "items": [1, 2,], /* trailing */
    }`)).toEqual({
      url: 'https://example.test//path',
      items: [1, 2]
    })
  })
})
