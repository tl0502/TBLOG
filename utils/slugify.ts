/**
 * Suggest a URL slug from arbitrary text for the editor's slug field.
 *
 * Mirrors the server's `normalizeSlug` so the suggestion matches what the API
 * would store. The server re-normalizes authoritatively and rejects titles that
 * reduce to an empty slug (e.g. non-Latin scripts), so this is only a hint.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
