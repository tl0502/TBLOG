import { z } from 'zod'
import { integrationCapabilityValues } from '../domain/integration'

export const integrationCapabilityParamSchema = z.enum(integrationCapabilityValues)
export const integrationProviderParamSchema = z.string().trim().min(1).max(64)
export const integrationActionParamSchema = z.string().trim().min(1).max(64)

export const updateIntegrationInputSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).default({})
})

/** Optional body for integration actions (e.g. Detect Models with unsaved form draft). */
export const integrationActionInputSchema = z
  .object({
    config: z.record(z.string(), z.unknown()).optional()
  })
  .strip()
  .optional()
  .default({})

export type UpdateIntegrationInput = z.infer<typeof updateIntegrationInputSchema>
export type IntegrationActionInput = z.infer<typeof integrationActionInputSchema>
