export const homeFeedSortValues = ['pageViews', 'publishedAt', 'updatedAt'] as const
export const sortOrderValues = ['asc', 'desc'] as const

export type HomeFeedSort = typeof homeFeedSortValues[number]
export type SortOrder = typeof sortOrderValues[number]

export const HOME_FEED_PAGE_SIZE = 25

export interface HomeFeedMeta {
  page: number
  pageSize: number
  total: number
  pageCount: number
  sort: HomeFeedSort
  order: SortOrder
  effectiveSort?: HomeFeedSort
  statisticsAvailable?: boolean
  reportRevision?: string | null
  reportUpdatedAt?: string | null
}
