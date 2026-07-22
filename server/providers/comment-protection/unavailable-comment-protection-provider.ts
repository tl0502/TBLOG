import {
  CommentProtectionProviderError,
  type CommentProtectionProvider
} from './comment-protection-provider'

/** Fail closed when an integration row is enabled but its runtime secret/config disappeared. */
export function createUnavailableCommentProtectionProvider(): CommentProtectionProvider {
  return {
    async verify() {
      throw new CommentProtectionProviderError('unavailable', 'Comment protection is unavailable')
    }
  }
}
