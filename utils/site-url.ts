/**
 * Client mirror of `server/utils/public-base-url.ts`. Resolves the absolute public base URL from the
 * publicly projected `seo.canonicalBaseUrl` (preferred) or the `NUXT_PUBLIC_SITE_URL` runtime
 * default, then joins root-relative paths for canonical and Open Graph URLs. Kept independent so the
 * client never imports server modules (see the layer-boundaries test).
 */
export function normalizeBaseUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null
  }
  const trimmed = url.trim().replace(/\/+$/, '')
  return trimmed.length > 0 ? trimmed : null
}

export function resolveClientBaseUrl(canonicalBaseUrl: string | null, fallbackUrl: string): string {
  return normalizeBaseUrl(canonicalBaseUrl) ?? normalizeBaseUrl(fallbackUrl) ?? 'http://localhost:3000'
}

export function absoluteUrl(base: string, path: string): string {
  if (!path || path === '/') {
    return `${base}/`
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
