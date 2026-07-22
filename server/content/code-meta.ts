export interface CodeBlockMeta {
  index: number
  language: string | null
  filename: string | null
  highlightedLines: number[]
  collapsed: boolean
  diff: boolean
}

function parseHighlightedLines(meta: string): number[] {
  const rangeMatch = meta.match(/\{([^}]+)\}/)
  if (!rangeMatch) {
    return []
  }

  const lines = new Set<number>()

  for (const part of rangeMatch[1].split(',')) {
    const trimmed = part.trim()
    const range = trimmed.match(/^(\d+)-(\d+)$/)

    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (start > 0 && end >= start) {
        for (let line = start; line <= end; line += 1) {
          lines.add(line)
        }
      }
      continue
    }

    const line = Number(trimmed)
    if (Number.isInteger(line) && line > 0) {
      lines.add(line)
    }
  }

  return [...lines].sort((left, right) => left - right)
}

function parseFilename(meta: string): string | null {
  const quoted = meta.match(/(?:title|filename)="([^"]+)"/)
  if (quoted) {
    return quoted[1]
  }

  const unquoted = meta.match(/(?:title|filename)=([^\s{}]+)/)
  return unquoted ? unquoted[1] : null
}

export function parseCodeFenceMeta(info: string | null | undefined, index: number): CodeBlockMeta {
  const normalized = (info ?? '').trim()
  const [languageCandidate = ''] = normalized.split(/\s+/, 1)
  const language = languageCandidate || null

  return {
    index,
    language,
    filename: parseFilename(normalized),
    highlightedLines: parseHighlightedLines(normalized),
    collapsed: /\bcollapse(?:d)?\b/.test(normalized),
    diff: /\bdiff\b/.test(normalized) || language === 'diff'
  }
}
