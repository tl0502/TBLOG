import { z } from 'zod'

export const updateAdministratorAccountSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  username: z.string().trim().min(3).max(64).optional(),
  password: z.string().min(12).max(256).optional()
}).refine((value) => value.username !== undefined || value.password !== undefined, {
  message: 'Username or password is required'
})

export const startTwoFactorSchema = z.object({
  currentPassword: z.string().min(1).max(256)
})

export const enableTwoFactorSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/)
})

export const disableTwoFactorSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  secondFactor: z.string().trim().min(6).max(32)
})

export const replaceAdminIpRulesSchema = z.object({
  allow: z.array(z.string().trim().min(2).max(64)).max(100),
  deny: z.array(z.string().trim().min(2).max(64)).max(100)
})

export const loginAttemptQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25)
})
