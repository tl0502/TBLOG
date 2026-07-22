import type { SearchProvider } from './search-provider'

/**
 * Default search provider used when no search integration is enabled or configured. Every call is
 * dropped, so article writes proceed unchanged and no external service is contacted. A real adapter
 * (e.g. Algolia) replaces this when the search integration is active.
 */
export function createNoOpSearchProvider(): SearchProvider {
  return {
    async indexRecord() {},
    async removeRecord() {},
    async replaceAllRecords() {}
  }
}
