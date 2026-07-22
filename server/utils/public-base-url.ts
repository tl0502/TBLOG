/**
 * Resolve the absolute public base URL used for canonical links, feeds, sitemap, and metadata.
 *
 * Precedence (architecture.md "SEO"): the admin-editable `seo.canonicalBaseUrl` wins so a deployed
 * site controls its own canonical origin from D1; otherwise the build-time `NUXT_PUBLIC_SITE_URL`
 * runtime default is used. Both are trimmed and stripped of trailing slashes so callers can safely
 * append `/path`. The mirror of this precedence on the client lives in `utils/site-url.ts`.
 */
export function normalizeBaseUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null
  }
  const trimmed = url.trim().replace(/\/+$/, '')
  return trimmed.length > 0 ? trimmed : null
}

export function resolvePublicBaseUrl(input: {
  canonicalBaseUrl: string | null
  fallbackUrl: string
}): string {
  return normalizeBaseUrl(input.canonicalBaseUrl) ?? normalizeBaseUrl(input.fallbackUrl) ?? 'http://localhost:3000'
}

/** Join a normalized base URL with a root-relative path into an absolute URL. */
export function absoluteUrl(base: string, path: string): string {
  if (!path || path === '/') {
    return `${base}/`
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
