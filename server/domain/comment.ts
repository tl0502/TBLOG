export const commentStatusValues = ['pending', 'approved', 'rejected'] as const
export const moderationStatusValues = ['approved', 'rejected'] as const

export type CommentStatus = (typeof commentStatusValues)[number]
export type ModerationStatus = (typeof moderationStatusValues)[number]
