export interface CommentReplicaRecord {
  id: string
  postId: string
  parentCommentId: string | null
  replyToNickname: string | null
  nickname: string
  content: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  reviewedAt: string | null
}

export type CommentReplicaEvent =
  | { operation: 'upsert', comment: CommentReplicaRecord }
  | { operation: 'remove', commentId: string, postId: string }

export interface CommentReplicaProvider {
  readonly providerKey: string
  replicate(event: CommentReplicaEvent): Promise<void>
}

export class CommentReplicaDisabledError extends Error {
  constructor() { super('Comment replica is disabled'); this.name = 'CommentReplicaDisabledError' }
}
