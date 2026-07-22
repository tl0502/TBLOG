import { slugify } from '../../utils/slugify'

describe('slugify', () => {
  it('lowercases and hyphenates Latin titles', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('collapses punctuation and repeated separators', () => {
    expect(slugify('  Draft: A/B  Test!! ')).toBe('draft-a-b-test')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('!!!Edge---case!!!')).toBe('edge-case')
  })

  it('keeps digits', () => {
    expect(slugify('Top 10 Tips')).toBe('top-10-tips')
  })

  it('returns empty for a non-Latin (e.g. Chinese) title so the author must set a slug', () => {
    expect(slugify('关于我')).toBe('')
  })
})
