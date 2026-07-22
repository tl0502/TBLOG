export interface CommentReplicaJob {
  id: string
  payloadJson: string
  revision: number
  attempts: number
}

export interface CommentReplicaJobRepository {
  listProviderJobs(providerKey: string, limit: number): Promise<CommentReplicaJob[]>
  complete(id: string, revision: number): Promise<void>
  fail(id: string, revision: number, error: string, now: Date): Promise<void>
}
