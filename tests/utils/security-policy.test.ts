import {
  baselineContentSecurityPolicy,
  baselineSecurityHeaders
} from '../../utils/security-policy'

describe('browser security policy', () => {
  it('blocks framing, plugins, MIME sniffing, and unnecessary browser capabilities', () => {
    expect(baselineContentSecurityPolicy).toContain("frame-ancestors 'none'")
    expect(baselineContentSecurityPolicy).toContain("object-src 'none'")
    expect(baselineSecurityHeaders).toMatchObject({
      'Strict-Transport-Security': expect.stringContaining('max-age='),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    })
    expect(baselineSecurityHeaders['Permissions-Policy']).toContain('camera=()')
  })

  it('keeps the CSP compatible with Nuxt hydration and optional frontend providers', () => {
    expect(baselineContentSecurityPolicy).toContain("script-src 'self' 'unsafe-inline' https:")
    expect(baselineContentSecurityPolicy).toContain("connect-src 'self' https:")
    expect(baselineContentSecurityPolicy).toContain('frame-src https://challenges.cloudflare.com')
  })
})
