export const integrationStatusValues = [
  'disabled',
  'configured',
  'active',
  'misconfigured',
  'unavailable'
] as const

export type IntegrationStatus = (typeof integrationStatusValues)[number]

export const integrationCapabilityValues = [
  'search',
  'analytics',
  'analyticsReport',
  'image',
  'storage',
  'cache',
  'commentProtection',
  'commentModeration',
  'commentReplica'
] as const

export type IntegrationCapability = (typeof integrationCapabilityValues)[number]
