export function resolvedHomePageReplacement(
  resolvedPage: number | undefined,
  requestedPage: number
): number | null {
  if (resolvedPage === undefined || resolvedPage === requestedPage) {
    return null
  }
  return resolvedPage
}
