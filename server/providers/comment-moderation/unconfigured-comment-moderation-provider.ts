import {
  CommentModerationProviderError,
  type CommentModerationProvider
} from './comment-moderation-provider'

/**
 * Safe baseline for deployments without automatic moderation. The service never calls this while
 * automatic moderation is disabled; if configuration drifts while the switch is enabled, it fails
 * closed instead of approving a comment or moving it into the manual queue.
 */
export function createUnconfiguredCommentModerationProvider(): CommentModerationProvider {
  return {
    async moderate() {
      throw new CommentModerationProviderError()
    }
  }
}
