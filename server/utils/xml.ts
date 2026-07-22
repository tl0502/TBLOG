/**
 * Minimal XML text/attribute escaping for hand-built RSS and sitemap documents. Escapes the five
 * XML predefined entities so stored titles, excerpts, and URLs cannot break document structure or
 * inject markup. Feeds are hand-built (no dependency) to stay Workers/SSR friendly and light.
 */
const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ENTITIES[char] ?? char)
}

/** RFC-822 date for RSS `pubDate` (e.g. "Mon, 01 Jun 2026 00:00:00 GMT"). */
export function toRfc822(date: Date): string {
  return date.toUTCString()
}

/** W3C datetime (seconds precision) for sitemap `lastmod`. */
export function toW3CDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}
