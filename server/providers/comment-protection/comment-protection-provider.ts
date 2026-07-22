export interface CommentProtectionVerification {
  token?: string
  remoteIp?: string
  expectedHostname?: string
}

export type CommentProtectionFailureKind = 'rejected' | 'unavailable'

export class CommentProtectionProviderError extends Error {
  constructor(
    public readonly kind: CommentProtectionFailureKind,
    message: string
  ) {
    super(message)
    this.name = 'CommentProtectionProviderError'
  }
}

export interface CommentProtectionProvider {
  verify(input: CommentProtectionVerification): Promise<void>
}
