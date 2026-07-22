import { absoluteUrl, normalizeBaseUrl, resolvePublicBaseUrl } from '../../../server/utils/public-base-url'

describe('public base url', () => {
  it('normalizes by trimming whitespace and trailing slashes', () => {
    expect(normalizeBaseUrl('  https://blog.example/  ')).toBe('https://blog.example')
    expect(normalizeBaseUrl('https://blog.example///')).toBe('https://blog.example')
    expect(normalizeBaseUrl('')).toBeNull()
    expect(normalizeBaseUrl('   ')).toBeNull()
    expect(normalizeBaseUrl(null)).toBeNull()
  })

  it('prefers the canonical base URL over the runtime fallback', () => {
    expect(
      resolvePublicBaseUrl({ canonicalBaseUrl: 'https://blog.example/', fallbackUrl: 'http://localhost:3000' })
    ).toBe('https://blog.example')
  })

  it('falls back to the runtime site URL when no canonical base URL is set', () => {
    expect(resolvePublicBaseUrl({ canonicalBaseUrl: null, fallbackUrl: 'https://fallback.example/' })).toBe(
      'https://fallback.example'
    )
    expect(resolvePublicBaseUrl({ canonicalBaseUrl: '  ', fallbackUrl: 'https://fallback.example' })).toBe(
      'https://fallback.example'
    )
  })

  it('joins root-relative paths, mapping "/" to a trailing-slash origin', () => {
    expect(absoluteUrl('https://blog.example', '/')).toBe('https://blog.example/')
    expect(absoluteUrl('https://blog.example', '/posts/a')).toBe('https://blog.example/posts/a')
    expect(absoluteUrl('https://blog.example', 'posts/a')).toBe('https://blog.example/posts/a')
  })
})
