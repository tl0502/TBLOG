import { resolvedHomePageReplacement } from '../../utils/home-feed-navigation'

describe('resolvedHomePageReplacement', () => {
  it('returns null when the resolved page is missing or already matches', () => {
    expect(resolvedHomePageReplacement(undefined, 2)).toBeNull()
    expect(resolvedHomePageReplacement(3, 3)).toBeNull()
    expect(resolvedHomePageReplacement(3, 3, 10)).toBeNull()
  })

  it('clamps only when the requested page is beyond pageCount', () => {
    expect(resolvedHomePageReplacement(3, 8, 3)).toBe(3)
    expect(resolvedHomePageReplacement(2, 99, 2)).toBe(2)
  })

  it('does not rewrite in-range requests that still show stale previous-page meta', () => {
    // User asked for page 2; stale feed still reports page 1 of 2.
    expect(resolvedHomePageReplacement(1, 2, 2)).toBeNull()
    // User asked for page 3; stale feed still reports page 1 of 5.
    expect(resolvedHomePageReplacement(1, 3, 5)).toBeNull()
  })

  it('rewrites any page > 1 to page 1 when the catalogue is empty', () => {
    expect(resolvedHomePageReplacement(1, 4, 0)).toBe(1)
    expect(resolvedHomePageReplacement(1, 1, 0)).toBeNull()
  })

  it('keeps legacy mismatch behavior when pageCount is omitted', () => {
    expect(resolvedHomePageReplacement(3, 8)).toBe(3)
  })
})
