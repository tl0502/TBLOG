import { absoluteUrl, normalizeBaseUrl, resolveClientBaseUrl } from '../../utils/site-url'

describe('client site url', () => {
  it('normalizes trailing slashes and whitespace', () => {
    expect(normalizeBaseUrl('  https://blog.example/  ')).toBe('https://blog.example')
    expect(normalizeBaseUrl('')).toBeNull()
    expect(normalizeBaseUrl(null)).toBeNull()
  })

  it('prefers the canonical base URL, then the runtime fallback', () => {
    expect(resolveClientBaseUrl('https://blog.example/', 'http://localhost:3000')).toBe('https://blog.example')
    expect(resolveClientBaseUrl(null, 'https://fallback.example/')).toBe('https://fallback.example')
    expect(resolveClientBaseUrl('   ', 'https://fallback.example')).toBe('https://fallback.example')
  })

  it('builds absolute URLs from root-relative paths', () => {
    expect(absoluteUrl('https://blog.example', '/')).toBe('https://blog.example/')
    expect(absoluteUrl('https://blog.example', '/posts/a')).toBe('https://blog.example/posts/a')
  })
})
