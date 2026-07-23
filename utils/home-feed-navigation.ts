/**
 * When the client has navigated to a page that does not exist (or is empty),
 * the feed API clamps `meta.page` downward. Return that clamped page so the
 * URL can be rewritten — but only when the request is known to be out of range.
 *
 * While a new page is loading, stale meta from the previous page may still
 * disagree with `requestedPage`; those mismatches must not rewrite the URL.
 */
export function resolvedHomePageReplacement(
  resolvedPage: number | undefined,
  requestedPage: number,
  pageCount?: number
): number | null {
  if (resolvedPage === undefined || resolvedPage === requestedPage) {
    return null
  }
  if (pageCount === undefined) {
    // Legacy callers without pageCount: keep previous clamp-on-mismatch behavior.
    return resolvedPage
  }
  if (pageCount <= 0) {
    return requestedPage === 1 ? null : 1
  }
  if (requestedPage > pageCount) {
    return resolvedPage
  }
  // In-range request still showing a different resolved page → treat as stale meta.
  return null
}
