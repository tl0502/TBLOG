import type { CommentProtectionProvider } from './comment-protection-provider'

export function createUnconfiguredCommentProtectionProvider(): CommentProtectionProvider {
  return {
    async verify() {}
  }
}
