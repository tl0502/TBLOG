import { z } from 'zod'
import { checkAlgoliaSearchReadiness } from '../../providers/search/algolia-search-provider'
import type { ProviderRegistration } from '../registry'

const configSchema = z
  .object({
    appId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9]+$/, 'Invalid Algolia application id').optional(),
    searchOnlyKey: z.string().trim().min(1).max(1024).optional(),
    indexName: z.string().trim().min(1).max(128)
      .refine((value) => !/[\\/]/.test(value), 'Algolia index name cannot contain slashes')
      .optional()
  })
  .strip()

/**
 * Algolia search. Stores public search config (app id, search-only key, index name) and reports
 * readiness. Index sync is implemented by the Algolia search adapter
 * (`server/providers/search/algolia-search-provider.ts`), which indexes, removes, and fully rebuilds
 * records via the Algolia REST API. The privileged admin key (`ALGOLIA_ADMIN_KEY`) must come from
 * Cloudflare Secrets and is never persisted in D1.
 */
export const algoliaRegistration: ProviderRegistration = {
  capability: 'search',
  providerKey: 'algolia',
  displayName: 'Algolia',
  configSchema,
  validate() {
    return null
  },
  async checkStatus(config, env) {
    const adminKey = typeof env.ALGOLIA_ADMIN_KEY === 'string' ? env.ALGOLIA_ADMIN_KEY : ''
    if (!adminKey) {
      return { status: 'unavailable', error: 'Missing ALGOLIA_ADMIN_KEY secret' }
    }
    const missing = (['appId', 'searchOnlyKey', 'indexName'] as const).filter((key) => !config[key])
    if (missing.length > 0) {
      return { status: 'misconfigured', error: `Missing search configuration: ${missing.join(', ')}` }
    }
    const result = await checkAlgoliaSearchReadiness({
      appId: config.appId as string,
      searchOnlyKey: config.searchOnlyKey as string,
      indexName: config.indexName as string,
      adminKey
    })
    return { status: result.status, error: result.error }
  },
  publicProjection(config) {
    return {
      appId: (config.appId as string | undefined) ?? null,
      searchOnlyKey: (config.searchOnlyKey as string | undefined) ?? null,
      indexName: (config.indexName as string | undefined) ?? null
    }
  },
  validatePublicProjection(config, env) {
    return typeof config.searchOnlyKey === 'string'
      && typeof env.ALGOLIA_ADMIN_KEY === 'string'
      && config.searchOnlyKey === env.ALGOLIA_ADMIN_KEY
      ? 'Search-only API key must not be the Algolia admin key'
      : null
  },
  requiredSecrets: ['ALGOLIA_ADMIN_KEY'],
  requiredBindings: [],
  formMeta: [
    {
      key: 'appId',
      label: 'Application ID',
      type: 'text',
      placeholder: 'ABCDE12345',
      help: 'Algolia application id.',
      required: true
    },
    {
      key: 'searchOnlyKey',
      label: 'Search-only API key',
      type: 'text',
      help: 'Public search-only key used by the browser. Never the admin key.',
      required: true
    },
    {
      key: 'indexName',
      label: 'Index name',
      type: 'text',
      placeholder: 'posts',
      help: 'Target index for published articles.',
      required: true
    }
  ],
  actions: [
    { key: 'test', label: 'Check status' },
    { key: 'resync', label: 'Rebuild index' }
  ]
}
