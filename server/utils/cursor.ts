export interface CursorValue {
  publishedAtMs: number
  id: string
}

function toBase64Url(input: string): string {
  // btoa is available in Node (tests) and on workerd (runtime); cursor input is ASCII.
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(input: string): string {
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0) {
    normalized += '='
  }
  return atob(normalized)
}

/** Opaque, URL-safe keyset cursor over (publishedAt, id). */
export function encodeCursor(value: CursorValue): string {
  return toBase64Url(`${value.publishedAtMs}:${value.id}`)
}

export function decodeCursor(cursor: string): CursorValue | null {
  try {
    const decoded = fromBase64Url(cursor)
    const separator = decoded.indexOf(':')
    if (separator <= 0) {
      return null
    }

    const publishedAtMs = Number(decoded.slice(0, separator))
    const id = decoded.slice(separator + 1)
    if (
      !Number.isSafeInteger(publishedAtMs)
      || publishedAtMs < 0
      || publishedAtMs > 8_640_000_000_000_000
      || !id
    ) {
      return null
    }

    return { publishedAtMs, id }
  } catch {
    return null
  }
}
