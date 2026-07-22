import type { TocItemView } from '~/types/public-view'

/**
 * Parse the stored `tocJson` string into view items. Defensive by design: a null,
 * non-array, or malformed payload yields `[]`, and individual entries that are not a
 * well-formed `{ id, depth: 2 | 3, text }` heading are dropped rather than thrown on.
 */
export function parseToc(tocJson: string | null): TocItemView[] {
  if (!tocJson) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(tocJson)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) {
    return []
  }

  const items: TocItemView[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const { id, depth, text } = entry as Record<string, unknown>
    if (typeof id === 'string' && id !== '' && typeof text === 'string' && (depth === 2 || depth === 3)) {
      items.push({ id, depth, text })
    }
  }

  return items
}
