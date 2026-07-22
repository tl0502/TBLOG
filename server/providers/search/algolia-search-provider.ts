import type { SearchProvider, SearchRecord } from './search-provider'

interface AlgoliaSearchProviderOptions {
  appId: string
  adminKey: string
  indexName: string
  /** Per-request timeout. Clamped to a safe provider range. */
  requestTimeoutMs?: number
  /** Clock for the temp index name during a rebuild. Injectable for deterministic tests. */
  now?: () => number
}

interface AlgoliaReadinessOptions {
  appId: string
  adminKey: string
  searchOnlyKey: string
  indexName: string
  requestTimeoutMs?: number
}

export interface AlgoliaReadinessResult {
  ready: boolean
  status: 'configured' | 'misconfigured' | 'unavailable'
  error?: string
}

const BATCH_SIZE = 1000
// Algolia Build/Free indices accept at most 10 KB per record. Keep a small margin for provider-side
// accounting differences while maximizing the searchable plain-text body retained in the record.
const MAX_RECORD_BYTES = 9_500
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const MIN_REQUEST_TIMEOUT_MS = 1_000
const MAX_REQUEST_TIMEOUT_MS = 30_000
const REQUIRED_INDEX_SETTINGS = {
  searchableAttributes: ['title', 'excerpt', 'body', 'category.name', 'tags.name'],
  unretrievableAttributes: ['body']
} as const
const TASK_POLL_ATTEMPTS = 100
const TASK_POLL_DELAY_MS = 200

function boundedTimeout(value?: number): number {
  return Math.min(
    MAX_REQUEST_TIMEOUT_MS,
    Math.max(MIN_REQUEST_TIMEOUT_MS, value ?? DEFAULT_REQUEST_TIMEOUT_MS)
  )
}

function algoliaHeaders(appId: string, apiKey: string) {
  return {
    'X-Algolia-API-Key': apiKey,
    'X-Algolia-Application-Id': appId,
    'Content-Type': 'application/json'
  }
}

function recordByteLength(record: SearchRecord): number {
  return new TextEncoder().encode(JSON.stringify(record)).byteLength
}

function fitStringField(
  record: SearchRecord,
  field: 'body' | 'excerpt',
  value: string
): string {
  const codePoints = Array.from(value)
  let low = 0
  let high = codePoints.length

  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2)
    const candidate = codePoints.slice(0, midpoint).join('')
    if (recordByteLength({ ...record, [field]: candidate }) <= MAX_RECORD_BYTES) {
      low = midpoint
    } else {
      high = midpoint - 1
    }
  }

  return codePoints.slice(0, low).join('')
}

/**
 * Fit one public record into Algolia's per-record byte limit without mutating the domain record.
 * Core navigation fields, title, category, and excerpt take priority. Tags are retained in their
 * existing order when possible; the searchable body receives all remaining UTF-8 JSON budget.
 */
function prepareAlgoliaRecord(record: SearchRecord): SearchRecord {
  if (recordByteLength(record) <= MAX_RECORD_BYTES) return record

  let prepared: SearchRecord = { ...record, tags: [...record.tags], body: '' }

  if (recordByteLength(prepared) > MAX_RECORD_BYTES && prepared.tags.length > 0) {
    let low = 0
    let high = prepared.tags.length
    while (low < high) {
      const midpoint = Math.ceil((low + high) / 2)
      if (recordByteLength({ ...prepared, tags: prepared.tags.slice(0, midpoint) }) <= MAX_RECORD_BYTES) {
        low = midpoint
      } else {
        high = midpoint - 1
      }
    }
    prepared = { ...prepared, tags: prepared.tags.slice(0, low) }
  }

  if (recordByteLength(prepared) > MAX_RECORD_BYTES && prepared.excerpt) {
    prepared = { ...prepared, excerpt: '' }
    prepared.excerpt = fitStringField(prepared, 'excerpt', record.excerpt ?? '')
  }

  if (recordByteLength(prepared) > MAX_RECORD_BYTES) {
    throw new Error(
      `Algolia record ${record.objectID} metadata exceeds the ${MAX_RECORD_BYTES}-byte safe limit`
    )
  }

  prepared.body = fitStringField(prepared, 'body', record.body)
  return prepared
}

function patternAllowsIndex(pattern: string, indexName: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(indexName)
}

function readinessFailure(status: number, context: string): AlgoliaReadinessResult {
  const unavailable = status === 429 || status >= 500
  return {
    ready: false,
    status: unavailable ? 'unavailable' : 'misconfigured',
    error: `${context} failed with HTTP ${status}`
  }
}

/**
 * Verify that the privileged key is valid and that the public key has search-only ACLs for the
 * configured index. A missing or unsafely configured index stays disabled until an administrator
 * runs the full rebuild, preventing an unverified key or retrievable full-text body from becoming
 * public configuration.
 */
export async function checkAlgoliaSearchReadiness(
  options: AlgoliaReadinessOptions
): Promise<AlgoliaReadinessResult> {
  if (options.searchOnlyKey === options.adminKey) {
    return {
      ready: false,
      status: 'misconfigured',
      error: 'Search-only API key must not be the Algolia admin key'
    }
  }

  const timeoutMs = boundedTimeout(options.requestTimeoutMs)
  try {
    const keyResponse = await fetch(
      `https://${options.appId}.algolia.net/1/keys/${encodeURIComponent(options.searchOnlyKey)}`,
      {
        method: 'GET',
        headers: algoliaHeaders(options.appId, options.adminKey),
        signal: AbortSignal.timeout(timeoutMs)
      }
    )
    if (!keyResponse.ok) return readinessFailure(keyResponse.status, 'Algolia API key inspection')

    const key = await keyResponse.json() as { acl?: unknown; indexes?: unknown }
    const acl = Array.isArray(key.acl) ? key.acl.filter((value): value is string => typeof value === 'string') : []
    if (acl.length !== 1 || acl[0] !== 'search') {
      return {
        ready: false,
        status: 'misconfigured',
        error: 'Configured public key must have only the Algolia search ACL'
      }
    }

    const indexes = Array.isArray(key.indexes)
      ? key.indexes.filter((value): value is string => typeof value === 'string')
      : []
    if (indexes.length > 0 && !indexes.some((pattern) => patternAllowsIndex(pattern, options.indexName))) {
      return {
        ready: false,
        status: 'misconfigured',
        error: 'Configured public key is not allowed to search the selected Algolia index'
      }
    }

    const queryResponse = await fetch(
      `https://${options.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(options.indexName)}/query`,
      {
        method: 'POST',
        headers: algoliaHeaders(options.appId, options.searchOnlyKey),
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ query: '', hitsPerPage: 0, attributesToRetrieve: ['objectID'] })
      }
    )
    if (queryResponse.status === 404) {
      return {
        ready: false,
        status: 'misconfigured',
        error: 'Algolia index does not exist yet; run Rebuild index before enabling search'
      }
    }
    if (!queryResponse.ok) {
      return readinessFailure(queryResponse.status, 'Algolia search-only query')
    }

    const settingsResponse = await fetch(
      `https://${options.appId}.algolia.net/1/indexes/${encodeURIComponent(options.indexName)}/settings`,
      {
        method: 'GET',
        headers: algoliaHeaders(options.appId, options.adminKey),
        signal: AbortSignal.timeout(timeoutMs)
      }
    )
    if (!settingsResponse.ok) return readinessFailure(settingsResponse.status, 'Algolia index settings check')
    const settings = await settingsResponse.json() as {
      searchableAttributes?: unknown
      unretrievableAttributes?: unknown
    }
    const searchable = Array.isArray(settings.searchableAttributes) ? settings.searchableAttributes : []
    const unretrievable = Array.isArray(settings.unretrievableAttributes) ? settings.unretrievableAttributes : []
    const settingsReady = searchable.length === REQUIRED_INDEX_SETTINGS.searchableAttributes.length
      && REQUIRED_INDEX_SETTINGS.searchableAttributes.every((attribute, index) => searchable[index] === attribute)
      && unretrievable.includes('body')
    if (!settingsReady) {
      return {
        ready: false,
        status: 'misconfigured',
        error: 'Algolia index settings are incomplete; run Rebuild index before enabling search'
      }
    }
    return { ready: true, status: 'configured' }
  } catch (error) {
    return {
      ready: false,
      status: 'unavailable',
      error: error instanceof Error ? `Algolia readiness check failed: ${error.message}` : 'Algolia readiness check failed'
    }
  }
}

/**
 * Algolia adapter over the Algolia REST API. Uses the global `fetch` available in the Cloudflare
 * Workers runtime. The privileged admin key must be passed in from Cloudflare Secrets — never from
 * persisted config. Provider errors are thrown (never swallowed); failure isolation is the caller's
 * job so a bad index write records retryable state instead of rolling back the article.
 */
export function createAlgoliaSearchProvider(options: AlgoliaSearchProviderOptions): SearchProvider {
  const { appId, adminKey, indexName } = options
  const now = options.now ?? (() => Date.now())
  const requestTimeoutMs = boundedTimeout(options.requestTimeoutMs)
  const host = `https://${appId}.algolia.net`
  // The index name is caller-supplied and may contain URL-significant characters; encode it for the
  // request path just like the object id. The raw name is still used in JSON bodies (e.g. move).
  const index = encodeURIComponent(indexName)
  const headers = algoliaHeaders(appId, adminKey)

  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${host}${path}`, {
      method,
      headers,
      signal: AbortSignal.timeout(requestTimeoutMs),
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  }

  async function ensureOk(response: Response, context: string): Promise<void> {
    if (response.ok) {
      return
    }
    const text = await response.text().catch(() => '')
    throw new Error(`Algolia ${context} failed: ${response.status} ${text}`)
  }

  async function waitForTask(targetIndex: string, response: Response, context: string): Promise<void> {
    const payload = await response.json().catch(() => null) as { taskID?: unknown } | null
    const taskID = typeof payload?.taskID === 'number'
      ? payload.taskID
      : typeof payload?.taskID === 'string' && /^\d+$/.test(payload.taskID)
        ? Number(payload.taskID)
        : null
    if (taskID === null) return

    for (let attempt = 0; attempt < TASK_POLL_ATTEMPTS; attempt += 1) {
      const taskResponse = await request('GET', `/1/indexes/${targetIndex}/task/${taskID}`)
      await ensureOk(taskResponse, `${context} task`)
      const task = await taskResponse.json().catch(() => null) as { status?: unknown } | null
      if (task?.status === 'published') return
      await new Promise((resolve) => setTimeout(resolve, TASK_POLL_DELAY_MS))
    }
    throw new Error(`Algolia ${context} task did not complete in time`)
  }

  async function ensureRequiredSettings(targetIndex = index): Promise<void> {
    const response = await request('PUT', `/1/indexes/${targetIndex}/settings`, REQUIRED_INDEX_SETTINGS)
    await ensureOk(response, 'configure index settings')
    await waitForTask(targetIndex, response, 'configure index settings')
  }

  return {
    async indexRecord(record: SearchRecord) {
      const prepared = prepareAlgoliaRecord(record)
      const response = await request(
        'PUT',
        `/1/indexes/${index}/${encodeURIComponent(record.objectID)}`,
        prepared
      )
      await ensureOk(response, 'indexRecord')
    },
    async removeRecord(objectID: string) {
      const response = await request('DELETE', `/1/indexes/${index}/${encodeURIComponent(objectID)}`)
      if (response.status === 404) {
        return
      }
      await ensureOk(response, 'removeRecord')
    },
    async replaceAllRecords(records: SearchRecord[]) {
      const preparedRecords = records.map(prepareAlgoliaRecord)
      // Build a temp index, then atomically move it over the live index. This avoids the
      // clear-then-refill window where search would observe an empty or partial index, and a
      // failure mid-rebuild leaves the live index untouched instead of emptied.
      const tempName = `${indexName}_reindex_${now()}`
      const tempIndex = encodeURIComponent(tempName)
      try {
        const copyResponse = await request('POST', `/1/indexes/${index}/operation`, {
          operation: 'copy',
          destination: tempName,
          scope: ['settings', 'synonyms', 'rules']
        })
        if (copyResponse.status !== 404) {
          await ensureOk(copyResponse, 'copy index configuration')
          await waitForTask(tempIndex, copyResponse, 'copy index configuration')
        }
        await ensureRequiredSettings(tempIndex)
        for (let start = 0; start < preparedRecords.length; start += BATCH_SIZE) {
          const batch = preparedRecords.slice(start, start + BATCH_SIZE)
          const response = await request('POST', `/1/indexes/${tempIndex}/batch`, {
            requests: batch.map((record) => ({ action: 'addObject', body: record }))
          })
          await ensureOk(response, 'replaceAllRecords batch')
          await waitForTask(tempIndex, response, 'replaceAllRecords batch')
        }
        const moveResponse = await request('POST', `/1/indexes/${tempIndex}/operation`, {
          operation: 'move',
          destination: indexName
        })
        await ensureOk(moveResponse, 'replaceAllRecords move')
        await waitForTask(tempIndex, moveResponse, 'replaceAllRecords move')
      } catch (error) {
        // Best-effort cleanup so a failed rebuild doesn't strand an orphan temp index.
        await request('DELETE', `/1/indexes/${tempIndex}`).catch(() => {})
        throw error
      }
    }
  }
}
