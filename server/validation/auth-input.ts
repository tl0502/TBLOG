import { z } from 'zod'

export const setupAdminInputSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(12).max(256)
})

export const loginInputSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
  secondFactor: z.string().trim().min(6).max(32).optional()
})

export type SetupAdminInput = z.infer<typeof setupAdminInputSchema>
export type LoginInput = z.infer<typeof loginInputSchema>
