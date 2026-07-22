import type { SearchSyncJobStatus, SearchSyncOperation } from '../../domain/search-sync'

export interface SearchSyncJob {
  id: string
  providerKey: string
  postId: string
  operation: SearchSyncOperation
  status: SearchSyncJobStatus
  attemptCount: number
  revision: number
  availableAt: Date
  leaseOwner: string | null
  lockedUntil: Date | null
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}

export interface SearchSyncJobCounts {
  pending: number
  dead: number
}

export interface SearchSyncJobRepository {
  enqueue(input: {
    providerKey: string
    postId: string
    operation: SearchSyncOperation
    availableAt: Date
    updatedAt: Date
  }): Promise<void>
  claim(input: {
    providerKey: string
    ownerToken: string
    limit: number
    now: Date
    lockedUntil: Date
  }): Promise<SearchSyncJob[]>
  complete(input: {
    id: string
    ownerToken: string
    revision: number
  }): Promise<boolean>
  fail(input: {
    id: string
    ownerToken: string
    revision: number
    attemptCount: number
    status: SearchSyncJobStatus
    availableAt: Date
    lastError: string
    updatedAt: Date
  }): Promise<boolean>
  clearPost(providerKey: string, postId: string, operation: SearchSyncOperation): Promise<void>
  clearProvider(providerKey: string): Promise<void>
  countByProvider(providerKey: string): Promise<SearchSyncJobCounts>
}
