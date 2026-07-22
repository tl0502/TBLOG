/** Format a stored ISO timestamp (e.g. `2026-06-01T00:00:00.000Z`) as `YYYY-MM-DD` for display. */
export function formatPublishedDate(iso: string): string {
  return iso.slice(0, 10)
}
