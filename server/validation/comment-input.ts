import { z } from 'zod'
import { commentStatusValues, moderationStatusValues } from '../domain/comment'
import { decodeCursor } from '../utils/cursor'

const unsafeNicknameCharacters = /[\u0000-\u001f\u007f-\u009f]|\p{Cf}/u
const unsafeCommentControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufeff]|\p{Bidi_Control}/u

function hasVisibleCommentText(value: string): boolean {
  return value.normalize('NFKC').replace(/\p{Cf}/gu, '').trim().length > 0
}

export const submitCommentInputSchema = z.object({
  nickname: z.string().trim().min(1).max(80)
    .refine((value) => !unsafeNicknameCharacters.test(value), 'Nickname contains unsafe invisible characters'),
  email: z.string().trim().email().max(254).optional(),
  content: z.string().trim().min(1).max(5000)
    .refine((value) => !unsafeCommentControls.test(value), 'Comment contains unsafe control characters')
    .refine(hasVisibleCommentText, 'Comment must contain visible text'),
  protectionToken: z.string().trim().max(2048).optional(),
  parentCommentId: z.string().trim().min(1).max(200).optional()
})

export const adminCommentListQuerySchema = z.object({
  status: z.enum(commentStatusValues).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

export const moderateCommentInputSchema = z.object({
  status: z.enum(moderationStatusValues)
})

export const publicCommentListQuerySchema = z.object({
  cursor: z.string().min(1).max(256).refine((value) => decodeCursor(value) !== null, {
    message: 'Invalid pagination cursor'
  }).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
})

export const commentIdParamSchema = z.string().trim().min(1).max(200)

export const autoModerateCommentsInputSchema = z.object({
  ids: z
    .array(commentIdParamSchema)
    .min(1)
    .max(8)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Comment IDs must be unique' })
})

export type SubmitCommentInputDto = z.infer<typeof submitCommentInputSchema>
export type AdminCommentListQueryDto = z.infer<typeof adminCommentListQuerySchema>
export type PublicCommentListQueryDto = z.infer<typeof publicCommentListQuerySchema>
export type ModerateCommentInputDto = z.infer<typeof moderateCommentInputSchema>
export type AutoModerateCommentsInputDto = z.infer<typeof autoModerateCommentsInputSchema>
