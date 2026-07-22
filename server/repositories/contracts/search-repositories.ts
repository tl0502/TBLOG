import type { SearchRecord } from '../../providers/search/search-provider'

/**
 * Narrow read port for a full search resync. Returns one record for every published, indexable
 * article (type `article`) — drafts and page-type content are never included.
 */
export interface SearchResyncReadRepository {
  listAllPublishedSearchRecords(): Promise<SearchRecord[]>
}

/**
 * Narrow read port that assembles the rich {@link SearchRecord} one article's index entry needs
 * (slug/name for category and tags, plain-text body). Returns `null` for anything that must not
 * be indexed: drafts, page-type content, or a missing post.
 */
export interface SearchIndexReadRepository {
  getSearchRecord(postId: string): Promise<SearchRecord | null>
}
