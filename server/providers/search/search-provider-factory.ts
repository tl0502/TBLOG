import type { SearchProvider } from './search-provider'
import { createAlgoliaSearchProvider } from './algolia-search-provider'
import { createNoOpSearchProvider } from './no-op-search-provider'

interface CreateSearchProviderParams {
  enabled: boolean
  config: Record<string, unknown>
  env: Record<string, unknown>
}

interface ResolveConfiguredProviderParams {
  config: Record<string, unknown>
  env: Record<string, unknown>
}

interface AlgoliaOptions {
  appId: string
  indexName: string
  adminKey: string
}

const ALGOLIA_APP_ID_PATTERN = /^[A-Za-z0-9]+$/

function isValidAlgoliaAppId(value: string): boolean {
  return value.length <= 64 && ALGOLIA_APP_ID_PATTERN.test(value)
}

function isValidAlgoliaIndexName(value: string): boolean {
  return value.length <= 128 && !/[\\/]/.test(value)
}

/**
 * Resolve complete Algolia credentials from public config + secrets, or `null` when any piece is
 * missing. The admin key is only ever read from `env` (Cloudflare Secrets), never from persisted
 * config. Single source of truth for "is search actually usable" — both the write-path factory and
 * the resync-path factory below build on it so their readiness rules cannot drift.
 */
function resolveAlgoliaOptions(
  config: Record<string, unknown>,
  env: Record<string, unknown>
): AlgoliaOptions | null {
  const appId = typeof config.appId === 'string' ? config.appId : ''
  const indexName = typeof config.indexName === 'string' ? config.indexName : ''
  const adminKey = typeof env.ALGOLIA_ADMIN_KEY === 'string' ? env.ALGOLIA_ADMIN_KEY : ''

  // Revalidate persisted values at the provider boundary as a fail-closed guard for legacy rows
  // created before the registry schema enforced Algolia host and path constraints.
  if (!isValidAlgoliaAppId(appId) || !isValidAlgoliaIndexName(indexName) || !adminKey) {
    return null
  }

  return { appId, indexName, adminKey }
}

/**
 * Resolves the search provider for the article write path. Falls back to the no-op provider when
 * search is disabled or the credentials are incomplete, so indexing silently degrades.
 */
export function createSearchProvider(params: CreateSearchProviderParams): SearchProvider {
  if (!params.enabled) {
    return createNoOpSearchProvider()
  }
  const options = resolveAlgoliaOptions(params.config, params.env)
  return options ? createAlgoliaSearchProvider(options) : createNoOpSearchProvider()
}

/**
 * Resolves a live provider for a manual resync, ignoring the `enabled` flag so a configured-but-off
 * integration can still be rebuilt. Returns `null` when the credentials are incomplete, letting the
 * caller report a clear failure instead of silently succeeding against a no-op provider.
 */
export function createConfiguredSearchProvider(
  params: ResolveConfiguredProviderParams
): SearchProvider | null {
  const options = resolveAlgoliaOptions(params.config, params.env)
  return options ? createAlgoliaSearchProvider(options) : null
}
