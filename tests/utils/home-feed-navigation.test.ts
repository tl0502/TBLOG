import { resolvedHomePageReplacement } from '../../utils/home-feed-navigation'

describe('home feed navigation', () => {
  it('does not replace a URL when no bootstrap response has resolved', () => {
    expect(resolvedHomePageReplacement(undefined, 2)).toBeNull()
  })

  it('replaces an out-of-range URL after the resolved bootstrap response arrives', () => {
    expect(resolvedHomePageReplacement(3, 8)).toBe(3)
    expect(resolvedHomePageReplacement(3, 3)).toBeNull()
  })
})
