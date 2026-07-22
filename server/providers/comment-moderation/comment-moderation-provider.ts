export interface CommentModerationInput {
  nickname: string
  content: string
  locale: string
  post: {
    id: string
    title: string
  }
}

export interface CommentModerationResult {
  decision: 'allow' | 'reject'
  confidence: number | null
  categories: string[]
  reasons: string[]
  providerRequestId: string | null
  modelVersion: string | null
}

export class CommentModerationProviderError extends Error {
  constructor(message = 'Comment moderation provider is unavailable') {
    super(message)
    this.name = 'CommentModerationProviderError'
  }
}

export interface CommentModerationProvider {
  /** Registry key used for bounded audit attribution after a provider is resolved. */
  readonly providerKey?: string
  moderate(input: CommentModerationInput): Promise<CommentModerationResult>
}
