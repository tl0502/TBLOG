/**
 * A single public search record for one published article. `objectID` is the post id so
 * re-indexing is idempotent. Only published, indexable content ever becomes a record — drafts
 * and (unless future settings enable it) page-type content are never passed to a provider.
 */
export interface SearchRecord {
  objectID: string
  title: string
  slug: string
  excerpt: string | null
  body: string
  category: { slug: string; name: string } | null
  tags: { slug: string; name: string }[]
  publishedAt: number
}

/**
 * Capability interface for optional full-text search. Business logic depends only on this
 * contract; adapters (e.g. Algolia) wrap the external service and never own publishing or
 * authorization rules.
 *
 * Indexing failures must not roll back saved article state: callers catch provider errors and
 * record retryable state instead of failing the write.
 */
export interface SearchProvider {
  /** Insert or replace the record for one published article. */
  indexRecord(record: SearchRecord): Promise<void>
  /** Remove one article's record (draft transition or delete). Missing records are a no-op. */
  removeRecord(objectID: string): Promise<void>
  /** Replace the entire index with the given records (full resync). */
  replaceAllRecords(records: SearchRecord[]): Promise<void>
}
