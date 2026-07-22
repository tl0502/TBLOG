import { z } from 'zod'
import { integrationCapabilityValues } from '../domain/integration'

export const integrationCapabilityParamSchema = z.enum(integrationCapabilityValues)
export const integrationProviderParamSchema = z.string().trim().min(1).max(64)
export const integrationActionParamSchema = z.string().trim().min(1).max(64)

export const updateIntegrationInputSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).default({})
})

export type UpdateIntegrationInput = z.infer<typeof updateIntegrationInputSchema>
