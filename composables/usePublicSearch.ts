import { inject, provide, type InjectionKey } from 'vue'
import type { Envelope } from '~/composables/usePublicApi'
import { publicResourceKey, useStaleFirstPublicResource } from '~/composables/useStaleFirstPublicResource'

export interface SearchConfigPayload {
  appId: string
  searchOnlyKey: string
  indexName: string
}

export interface SearchConfigData {
  enabled: boolean
  provider: string | null
  config: SearchConfigPayload | null
}

export interface SearchHitHighlight {
  value: string
}

export interface SearchHit {
  objectID: string
  title: string
  slug: string
  excerpt: string | null
  body?: string
  category: { slug: string; name: string } | null
  tags: { slug: string; name: string }[]
  publishedAt?: number
  _highlightResult?: Record<string, SearchHitHighlight | undefined>
}

export interface SearchOutcome {
  hits: SearchHit[]
  error: boolean
  nbHits: number
  page: number
  nbPages: number
}

export interface SearchRequestOptions {
  hitsPerPage?: number
  page?: number
}

export const MAX_SEARCH_QUERY_LENGTH = 300

/**
 * Public, cacheable search configuration. Resolves whether browser-direct Algolia search is
 * available and, if so, the search-only credentials. Failures/disabled configs degrade gracefully
 * (enabled: false) so callers can hide the search UI without throwing.
 */
export function useSearchConfig(options: { server?: boolean } = {}) {
  return useStaleFirstPublicResource<Envelope<SearchConfigData>>('/api/v1/search-config', {
    key: publicResourceKey('search-config'),
    server: options.server
  })
}

const searchConfigStateKey: InjectionKey<ReturnType<typeof useSearchConfig>> =
  Symbol('tblog-public-search-config-state')

export function provideSearchConfigState(state: ReturnType<typeof useSearchConfig>): void {
  provide(searchConfigStateKey, state)
}

export function useSearchConfigState(): ReturnType<typeof useSearchConfig> {
  const state = inject(searchConfigStateKey, null)
  if (!state) {
    throw new Error('Public search config state is not provided')
  }
  return state
}

// Only retrieve fields rendered by the result list. The index keeps `body` searchable while its
// `unretrievableAttributes` setting prevents the public key from returning it.
const RESULT_ATTRIBUTES = ['title', 'slug', 'excerpt', 'category', 'tags']

/**
 * Query Algolia's search REST API directly from the browser using the search-only key. Zero
 * dependency (no algoliasearch package) so it stays Workers/SSR friendly. Never throws: network or
 * non-2xx responses resolve to an empty result with `error: true`.
 */
export async function searchAlgolia(
  config: SearchConfigPayload | null,
  query: string,
  signal?: AbortSignal,
  options: SearchRequestOptions = {}
): Promise<SearchOutcome> {
  const trimmed = query.trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
  const page = Math.max(0, Math.trunc(options.page ?? 0))
  const hitsPerPage = Math.min(50, Math.max(1, Math.trunc(options.hitsPerPage ?? 20)))
  if (!config || !config.appId || !config.searchOnlyKey || !config.indexName || trimmed.length === 0) {
    // Fresh object each call — never hand back a shared instance a caller might mutate.
    return { hits: [], error: false, nbHits: 0, page, nbPages: 0 }
  }

  const url = `https://${config.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(config.indexName)}/query`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Algolia-API-Key': config.searchOnlyKey,
        'X-Algolia-Application-Id': config.appId,
        'Content-Type': 'application/json'
      },
      signal,
      body: JSON.stringify({ query: trimmed, hitsPerPage, page, attributesToRetrieve: RESULT_ATTRIBUTES })
    })

    if (!response.ok) {
      return { hits: [], error: true, nbHits: 0, page, nbPages: 0 }
    }

    const payload = (await response.json()) as {
      hits?: SearchHit[]
      nbHits?: unknown
      page?: unknown
      nbPages?: unknown
    }
    return {
      hits: Array.isArray(payload.hits) ? payload.hits : [],
      error: false,
      nbHits: typeof payload.nbHits === 'number' ? payload.nbHits : 0,
      page: typeof payload.page === 'number' ? payload.page : page,
      nbPages: typeof payload.nbPages === 'number' ? payload.nbPages : 0
    }
  } catch {
    if (signal?.aborted) return { hits: [], error: false, nbHits: 0, page, nbPages: 0 }
    return { hits: [], error: true, nbHits: 0, page, nbPages: 0 }
  }
}
