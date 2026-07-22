/** Public, non-secret deployment policy displayed by the admin Security tab and used by cookies. */
export const adminSessionPolicy = {
  ttlSeconds: 60 * 60 * 24 * 7,
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  setupLock: 'automatic' as const,
  originModel: 'same-origin' as const
}

export const baselineContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https:",
  'frame-src https://challenges.cloudflare.com',
  "worker-src 'self' blob:",
  "manifest-src 'self'"
].join('; ')

/** Compatible baseline for Nuxt hydration, configurable analytics, Algolia, and Turnstile. */
export const baselineSecurityHeaders = {
  'Content-Security-Policy': baselineContentSecurityPolicy,
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()'
} as const
