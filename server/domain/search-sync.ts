export const searchSyncOperationValues = ['upsert', 'remove'] as const
export type SearchSyncOperation = (typeof searchSyncOperationValues)[number]

export const searchSyncJobStatusValues = ['pending', 'dead'] as const
export type SearchSyncJobStatus = (typeof searchSyncJobStatusValues)[number]
