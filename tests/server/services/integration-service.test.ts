import { authError } from '../../../server/domain/auth-errors'
import type {
  IntegrationSettingsRepository,
  StoredIntegration,
  UpsertIntegrationRecord
} from '../../../server/repositories/contracts/integration-repositories'
import { createIntegrationService } from '../../../server/services/integration-service'
import { integrationRegistry } from '../../../server/integrations/registry'
import type { Permission } from '../../../server/services/permissions'

class FakeIntegrationRepository implements IntegrationSettingsRepository {
  rows = new Map<string, StoredIntegration>()
  upserts: UpsertIntegrationRecord[] = []

  seed(row: Omit<StoredIntegration, 'updatedAt'> & { updatedAt?: Date }) {
    this.rows.set(`${row.capability}:${row.providerKey}`, { updatedAt: new Date(0), ...row })
  }

  async list() {
    return [...this.rows.values()]
  }

  async findByCapabilityAndProvider(capability: string, providerKey: string) {
    return this.rows.get(`${capability}:${providerKey}`) ?? null
  }

  async upsert(record: UpsertIntegrationRecord) {
    this.upserts.push(record)
    this.rows.set(`${record.capability}:${record.providerKey}`, {
      capability: record.capability,
      providerKey: record.providerKey,
      enabled: record.enabled,
      publicConfigJson: record.publicConfigJson,
      status: record.status,
      lastCheckedAt: record.lastCheckedAt,
      lastError: record.lastError,
      updatedAt: record.updatedAt
    })
  }

  async upsertOperationalStatus(record: UpsertIntegrationRecord) {
    this.upserts.push(record)
    const key = `${record.capability}:${record.providerKey}`
    const existing = this.rows.get(key)
    this.rows.set(key, existing
      ? {
          ...existing,
          status: record.status,
          lastCheckedAt: record.lastCheckedAt,
          lastError: record.lastError
        }
      : {
          capability: record.capability,
          providerKey: record.providerKey,
          enabled: record.enabled,
          publicConfigJson: record.publicConfigJson,
          status: record.status,
          lastCheckedAt: record.lastCheckedAt,
          lastError: record.lastError,
          updatedAt: record.updatedAt
        })
  }

  async upsertExclusive(record: UpsertIntegrationRecord, capability: string) {
    for (const [key, row] of this.rows) {
      if (row.capability === capability && row.providerKey !== record.providerKey) {
        this.rows.set(key, { ...row, enabled: false, status: 'disabled', lastError: null })
      }
    }
    await this.upsert(record)
  }

  async upsertAnalyticsReportExclusive(record: UpsertIntegrationRecord) {
    await this.upsertExclusive(record, 'analyticsReport')
  }

  async touch() {}
}

const ADMIN: Permission[] = ['integration:*']
const NOW = new Date('2026-07-14T12:00:00.000Z')

function algoliaReadyFetch() {
  return vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ acl: ['search'], indexes: ['posts'] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ hits: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      searchableAttributes: ['title', 'excerpt', 'body', 'category.name', 'tags.name'],
      unretrievableAttributes: ['body']
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
}

function createService(env: Record<string, unknown> = {}, cacheDelete = vi.fn().mockResolvedValue(undefined)) {
  const repository = new FakeIntegrationRepository()
  const service = createIntegrationService({
    integrationRepository: repository,
    env,
    now: () => NOW,
    cache: { get: vi.fn(), set: vi.fn(), delete: cacheDelete }
  })
  return { service, repository, cacheDelete }
}

function find(views: Awaited<ReturnType<ReturnType<typeof createService>['service']['list']>>, key: string) {
  return views.find((view) => `${view.capability}:${view.providerKey}` === key)!
}

describe('integration service', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('forbids every operation without the integration permission', async () => {
    const { service, repository } = createService()

    for (const run of [
      () => service.list([]),
      () => service.update('commentProtection', 'turnstile', { enabled: false, config: {} }, []),
      () => service.runAction('commentProtection', 'turnstile', 'test', [])
    ]) {
      await expect(run()).rejects.toMatchObject({ code: 'forbidden', statusCode: 403 })
    }
    expect(repository.upserts).toEqual([])
  })

  it('merges the registry with stored rows and reports missing secrets', async () => {
    const { service, repository } = createService({ TURNSTILE_SECRET_KEY: 'secret' })
    repository.seed({
      capability: 'commentProtection',
      providerKey: 'turnstile',
      enabled: true,
      publicConfigJson: JSON.stringify({ siteKey: 'site-1' }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null
    })

    const views = await service.list(ADMIN)

    const turnstile = find(views, 'commentProtection:turnstile')
    expect(turnstile).toMatchObject({
      enabled: true,
      status: 'configured',
      config: { siteKey: 'site-1' },
      missingSecrets: []
    })
    expect(turnstile.formMeta[0]).toMatchObject({ key: 'siteKey', required: true })
    expect(turnstile.actions).toEqual([{ key: 'test', label: 'Check status' }])

    // Unstored registrations default to a disabled view but still surface missing requirements.
    const algolia = find(views, 'search:algolia')
    expect(algolia).toMatchObject({
      enabled: false,
      status: 'disabled',
      missingSecrets: ['ALGOLIA_ADMIN_KEY']
    })
  })

  it('saves an enabled provider as configured when config and secrets are present', async () => {
    const { service, repository, cacheDelete } = createService({ TURNSTILE_SECRET_KEY: 'secret' })

    const view = await service.update(
      'commentProtection',
      'turnstile',
      { enabled: true, config: { siteKey: 'site-1' } },
      ADMIN
    )

    expect(view).toMatchObject({ enabled: true, status: 'configured', lastError: null })
    expect(repository.upserts[0]).toMatchObject({
      enabled: true,
      status: 'configured',
      publicConfigJson: JSON.stringify({ siteKey: 'site-1' }),
      updatedAt: NOW
    })
    expect(cacheDelete).toHaveBeenCalledWith(['site-settings'])
  })

  it('atomically makes analytics provider activation exclusive and invalidates public config', async () => {
    const { service, repository, cacheDelete } = createService()
    repository.seed({
      capability: 'analytics', providerKey: 'umami', enabled: true,
      publicConfigJson: JSON.stringify({ scriptUrl: 'https://umami.example/script.js', siteId: 'old' }),
      status: 'active', lastCheckedAt: null, lastError: null
    })

    await service.update('analytics', 'plausible', {
      enabled: true,
      config: { scriptUrl: 'https://plausible.example/js/script.js', siteId: 'blog.example' }
    }, ADMIN)

    expect((await repository.findByCapabilityAndProvider('analytics', 'umami'))?.enabled).toBe(false)
    expect((await repository.findByCapabilityAndProvider('analytics', 'plausible'))?.enabled).toBe(true)
    expect(cacheDelete).toHaveBeenCalledWith(['site-settings'])
  })

  it('atomically makes comment moderation provider activation exclusive', async () => {
    const { service, repository } = createService({ OPENAI_API_KEY: 'openai-secret' })
    repository.seed({
      capability: 'commentModeration', providerKey: 'http', enabled: true,
      publicConfigJson: JSON.stringify({
        endpoint: 'https://moderation.example.com/v1/comments', model: null, timeoutMs: 5_000
      }),
      status: 'active', lastCheckedAt: NOW, lastError: null
    })

    await service.update('commentModeration', 'openai', {
      enabled: true,
      config: {}
    }, ADMIN)

    expect(await repository.findByCapabilityAndProvider('commentModeration', 'http'))
      .toMatchObject({ enabled: false, status: 'disabled' })
    expect(await repository.findByCapabilityAndProvider('commentModeration', 'openai'))
      .toMatchObject({ enabled: true, status: 'configured' })
  })

  it('keeps a provider disabled with unavailable status when a required secret is missing', async () => {
    const { service, repository } = createService()

    const view = await service.update(
      'commentProtection',
      'turnstile',
      { enabled: true, config: { siteKey: 'site-1' } },
      ADMIN
    )

    expect(view).toMatchObject({ enabled: false, status: 'unavailable' })
    expect(view.lastError).toContain('TURNSTILE_SECRET_KEY')
    expect(repository.upserts[0]).toMatchObject({ enabled: false, status: 'unavailable' })
  })

  it('keeps a provider disabled with misconfigured status when a required field is missing', async () => {
    const { service } = createService({ TURNSTILE_SECRET_KEY: 'secret' })

    const view = await service.update(
      'commentProtection',
      'turnstile',
      { enabled: true, config: {} },
      ADMIN
    )

    expect(view).toMatchObject({ enabled: false, status: 'misconfigured' })
    expect(view.lastError).toContain('siteKey')
  })

  it('stores a disabled provider without probing requirements', async () => {
    const { service, repository } = createService()

    const view = await service.update(
      'search',
      'algolia',
      { enabled: false, config: { appId: 'A1', searchOnlyKey: 'k', indexName: 'posts' } },
      ADMIN
    )

    expect(view).toMatchObject({ enabled: false, status: 'disabled', lastError: null })
    expect(repository.upserts[0]?.status).toBe('disabled')
  })

  it('enables Algolia only after the admin and search-only credentials pass a live probe', async () => {
    const fetchMock = algoliaReadyFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { service, repository } = createService({ ALGOLIA_ADMIN_KEY: 'admin-key' })

    const view = await service.update('search', 'algolia', {
      enabled: true,
      config: { appId: 'APP1', searchOnlyKey: 'search-key', indexName: 'posts' }
    }, ADMIN)

    expect(view).toMatchObject({ enabled: true, status: 'configured', lastError: null })
    expect(repository.upserts[0]).toMatchObject({ enabled: true, status: 'configured' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('keeps Algolia disabled when the public key is the privileged admin key', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { service, repository } = createService({ ALGOLIA_ADMIN_KEY: 'same-key' })

    const view = await service.update('search', 'algolia', {
      enabled: true,
      config: { appId: 'APP1', searchOnlyKey: 'same-key', indexName: 'posts' }
    }, ADMIN)

    expect(view).toMatchObject({ enabled: false, status: 'misconfigured' })
    expect(view.lastError).toContain('must not be')
    expect(repository.upserts[0]).toMatchObject({ enabled: false, status: 'misconfigured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an unknown provider', async () => {
    const { service } = createService()

    await expect(
      service.update('search', 'unknown', { enabled: false, config: {} }, ADMIN)
    ).rejects.toMatchObject({ code: 'provider_not_found', statusCode: 404 })
  })

  it('rejects structurally invalid config with a 422', async () => {
    const { service } = createService({ TURNSTILE_SECRET_KEY: 'secret' })

    await expect(
      service.update('commentProtection', 'turnstile', { enabled: true, config: { siteKey: '' } }, ADMIN)
    ).rejects.toMatchObject({ code: 'invalid_config', statusCode: 422 })
  })

  it('runs the status action and persists the checked timestamp and status', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      'error-codes': ['invalid-input-response']
    })))
    const { service, repository } = createService({ TURNSTILE_SECRET_KEY: 'secret', fetch })
    repository.seed({
      capability: 'commentProtection',
      providerKey: 'turnstile',
      enabled: true,
      publicConfigJson: JSON.stringify({ siteKey: 'site-1' }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null
    })

    const view = await service.runAction('commentProtection', 'turnstile', 'test', ADMIN)

    expect(view).toMatchObject({ status: 'configured', lastCheckedAt: NOW, lastError: null, enabled: true })
    expect(repository.upserts[0]).toMatchObject({
      status: 'configured',
      lastCheckedAt: NOW,
      enabled: true
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('marks Turnstile unavailable when the live secret probe rejects the secret', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      'error-codes': ['invalid-input-secret']
    })))
    const { service, repository } = createService({ TURNSTILE_SECRET_KEY: 'bad-secret', fetch })
    repository.seed({
      capability: 'commentProtection',
      providerKey: 'turnstile',
      enabled: true,
      publicConfigJson: JSON.stringify({ siteKey: 'site-1' }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null
    })

    const view = await service.runAction('commentProtection', 'turnstile', 'test', ADMIN)

    expect(view).toMatchObject({ status: 'unavailable', enabled: true })
    expect(view.lastError).toContain('invalid')
    expect(repository.upserts[0]).toMatchObject({ status: 'unavailable', enabled: true })
  })

  it('keeps a disabled provider disabled even when its status probe is healthy', async () => {
    const { service, repository } = createService()
    repository.seed({
      capability: 'image',
      providerKey: 'url-template',
      enabled: false,
      publicConfigJson: JSON.stringify({ thumbnail: 'https://img.example/?src={url}' }),
      status: 'disabled',
      lastCheckedAt: null,
      lastError: null
    })

    const view = await service.runAction('image', 'url-template', 'test', ADMIN)

    expect(view).toMatchObject({ enabled: false, status: 'disabled', lastError: null })
    expect(repository.upserts[0]).toMatchObject({ enabled: false, status: 'disabled' })
  })

  it('rejects invalid persisted config before running a provider status probe', async () => {
    const { service, repository } = createService({ MEDIA_R2: {} })
    repository.seed({
      capability: 'storage',
      providerKey: 'cloudflare-r2',
      enabled: true,
      publicConfigJson: JSON.stringify({ publicBaseUrl: 123 }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null
    })

    const view = await service.runAction('storage', 'cloudflare-r2', 'test', ADMIN)

    expect(view).toMatchObject({ enabled: true, status: 'misconfigured' })
    expect(view.lastError).toBeTruthy()
    expect(repository.upserts[0]).toMatchObject({ enabled: true, status: 'misconfigured' })
  })

  it('records unavailable status from an action probe when a secret is missing', async () => {
    const { service } = createService()

    const view = await service.runAction('search', 'algolia', 'test', ADMIN)

    expect(view.status).toBe('unavailable')
    expect(view.lastError).toContain('ALGOLIA_ADMIN_KEY')
    expect(view.lastCheckedAt).toEqual(NOW)
  })

  it('does not advance the analytics report configuration generation during a status probe', async () => {
    const generation = new Date('2026-07-14T10:00:00.000Z')
    const report = {
      schemaVersion: 1,
      revision: 'source-1',
      generatedAt: '2026-07-14T09:00:00.000Z',
      syncedThrough: '2026-07-13',
      articles: [],
      currentHotspots: [],
      historicalHotspots: []
    }
    const { service, repository } = createService({
      ANALYTICS_REPORT_TOKEN: 'secret',
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(report), {
        headers: { 'Content-Type': 'application/json' }
      }))
    })
    repository.seed({
      capability: 'analyticsReport',
      providerKey: 'http-analytics-report',
      enabled: true,
      publicConfigJson: JSON.stringify({
        endpoint: 'https://analytics.example.com/report',
        siteId: null,
        timeoutMs: 10_000
      }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null,
      updatedAt: generation
    })

    await expect(service.runAction('analyticsReport', 'http-analytics-report', 'test', ADMIN))
      .resolves.toMatchObject({ status: 'active', lastCheckedAt: NOW })

    await expect(repository.findByCapabilityAndProvider('analyticsReport', 'http-analytics-report'))
      .resolves.toMatchObject({
        status: 'active',
        lastCheckedAt: NOW,
        updatedAt: generation
      })
  })

  it('rejects an unknown action', async () => {
    const { service } = createService()

    await expect(
      service.runAction('commentProtection', 'turnstile', 'nope', ADMIN)
    ).rejects.toMatchObject({ code: 'action_not_found', statusCode: 404 })
  })

  it('rebuilds the search index and marks the provider active on a successful resync', async () => {
    const repository = new FakeIntegrationRepository()
    repository.seed({
      capability: 'search',
      providerKey: 'algolia',
      enabled: true,
      publicConfigJson: JSON.stringify({ appId: 'A1', searchOnlyKey: 'k', indexName: 'posts' }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null
    })

    const records = [
      {
        objectID: 'p1',
        title: 'Hello',
        slug: 'hello',
        excerpt: null,
        body: 'body',
        category: null,
        tags: [],
        publishedAt: 1
      }
    ]
    let replaced: typeof records | null = null
    const clearProvider = vi.fn()
    const service = createIntegrationService({
      integrationRepository: repository,
      env: {},
      now: () => NOW,
      searchProviderFactory: () => ({
        async indexRecord() {},
        async removeRecord() {},
        async replaceAllRecords(input) {
          replaced = input as typeof records
        }
      }),
      searchResyncRepository: {
        async listAllPublishedSearchRecords() {
          return records
        }
      },
      searchSyncJobRepository: { clearProvider }
    })

    const view = await service.runAction('search', 'algolia', 'resync', ADMIN)

    expect(replaced).toEqual(records)
    expect(view).toMatchObject({ status: 'active', lastCheckedAt: NOW, lastError: null })
    expect(repository.upserts[0]).toMatchObject({ status: 'active', lastCheckedAt: NOW, lastError: null })
    expect(clearProvider).toHaveBeenCalledWith('algolia')
  })

  it('records misconfigured state without throwing when a resync provider fails', async () => {
    const repository = new FakeIntegrationRepository()
    repository.seed({
      capability: 'search',
      providerKey: 'algolia',
      enabled: true,
      publicConfigJson: JSON.stringify({ appId: 'A1', searchOnlyKey: 'k', indexName: 'posts' }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null
    })

    const service = createIntegrationService({
      integrationRepository: repository,
      env: {},
      now: () => NOW,
      searchProviderFactory: () => ({
        async indexRecord() {},
        async removeRecord() {},
        async replaceAllRecords() {
          throw new Error('index rebuild failed')
        }
      }),
      searchResyncRepository: {
        async listAllPublishedSearchRecords() {
          return []
        }
      }
    })

    const view = await service.runAction('search', 'algolia', 'resync', ADMIN)

    expect(view.status).toBe('misconfigured')
    expect(view.lastError).toContain('index rebuild failed')
    expect(view.lastCheckedAt).toEqual(NOW)
    expect(repository.upserts[0]).toMatchObject({ status: 'misconfigured' })
  })

  it('reports misconfigured (not a false success) when resync credentials are incomplete', async () => {
    const repository = new FakeIntegrationRepository()
    repository.seed({
      capability: 'search',
      providerKey: 'algolia',
      enabled: true,
      publicConfigJson: JSON.stringify({ appId: 'A1', searchOnlyKey: 'k', indexName: 'posts' }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null
    })

    let rebuilt = false
    const service = createIntegrationService({
      integrationRepository: repository,
      env: {},
      now: () => NOW,
      // Incomplete config/secret → factory yields null instead of a live provider.
      searchProviderFactory: () => null,
      searchResyncRepository: {
        async listAllPublishedSearchRecords() {
          rebuilt = true
          return []
        }
      }
    })

    const view = await service.runAction('search', 'algolia', 'resync', ADMIN)

    expect(rebuilt).toBe(false)
    expect(view.status).toBe('misconfigured')
    expect(view.lastError).toContain('not fully configured')
    expect(repository.upserts[0]).toMatchObject({ status: 'misconfigured' })
  })

  it('returns a disabled public search config when no search provider is active', async () => {
    const { service } = createService()

    await expect(service.getPublicSearchConfig()).resolves.toEqual({
      enabled: false,
      provider: null,
      config: null
    })
  })

  it('returns the public projection for an enabled and configured search provider', async () => {
    const { service, repository } = createService()
    repository.seed({
      capability: 'search',
      providerKey: 'algolia',
      enabled: true,
      publicConfigJson: JSON.stringify({
        appId: 'A1',
        searchOnlyKey: 'search-key',
        indexName: 'posts'
      }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null
    })

    const result = await service.getPublicSearchConfig()

    expect(result).toEqual({
      enabled: true,
      provider: 'algolia',
      config: { appId: 'A1', searchOnlyKey: 'search-key', indexName: 'posts' }
    })
    expect(JSON.stringify(result)).not.toContain('ADMIN')
  })

  it('keeps public search readable while write synchronization has an administrator warning', async () => {
    const { service, repository } = createService()
    repository.seed({
      capability: 'search',
      providerKey: 'algolia',
      enabled: true,
      publicConfigJson: JSON.stringify({
        appId: 'A1',
        searchOnlyKey: 'search-key',
        indexName: 'posts'
      }),
      status: 'misconfigured',
      lastCheckedAt: NOW,
      lastError: 'Search index synchronization is retrying 1 pending job.'
    })

    await expect(service.getPublicSearchConfig()).resolves.toEqual({
      enabled: true,
      provider: 'algolia',
      config: { appId: 'A1', searchOnlyKey: 'search-key', indexName: 'posts' }
    })

    const views = await service.list(ADMIN)
    expect(find(views, 'search:algolia')).toMatchObject({
      status: 'misconfigured',
      lastError: 'Search index synchronization is retrying 1 pending job.'
    })
  })

  it('never projects a legacy row whose public key equals the Algolia admin secret', async () => {
    const { service, repository } = createService({ ALGOLIA_ADMIN_KEY: 'privileged-key' })
    repository.seed({
      capability: 'search',
      providerKey: 'algolia',
      enabled: true,
      publicConfigJson: JSON.stringify({
        appId: 'A1',
        searchOnlyKey: 'privileged-key',
        indexName: 'posts'
      }),
      status: 'configured',
      lastCheckedAt: NOW,
      lastError: null
    })

    await expect(service.getPublicSearchConfig()).resolves.toEqual({
      enabled: false,
      provider: null,
      config: null
    })
  })

  it('resolves Umami secret requirements from the selected authentication mode', async () => {
    const { service, repository } = createService({ UMAMI_API_TOKEN: 'cloud-api-key' })
    repository.seed({
      capability: 'analyticsReport',
      providerKey: 'umami',
      enabled: false,
      publicConfigJson: JSON.stringify({
        apiBaseUrl: 'https://umami.example.com/api',
        websiteId: 'website-id',
        authMode: 'bearer',
        timeoutMs: 10_000
      }),
      status: 'disabled',
      lastCheckedAt: null,
      lastError: null
    })

    const stored = find(await service.list(ADMIN), 'analyticsReport:umami')
    expect(stored).toMatchObject({
      requiredSecrets: ['UMAMI_SELF_HOSTED_CREDENTIAL'],
      missingSecrets: ['UMAMI_SELF_HOSTED_CREDENTIAL']
    })

    const enabled = await service.update('analyticsReport', 'umami', {
      enabled: true,
      config: {
        apiBaseUrl: 'https://umami.example.com/api',
        websiteId: 'website-id',
        authMode: 'bearer'
      }
    }, ADMIN)
    expect(enabled).toMatchObject({
      enabled: false,
      status: 'unavailable',
      requiredSecrets: ['UMAMI_SELF_HOSTED_CREDENTIAL'],
      missingSecrets: ['UMAMI_SELF_HOSTED_CREDENTIAL']
    })
    expect(enabled.lastError).toContain('UMAMI_SELF_HOSTED_CREDENTIAL')
  })

  it('ignores a search provider that is enabled but not yet configured', async () => {
    const { service, repository } = createService()
    repository.seed({
      capability: 'search',
      providerKey: 'algolia',
      enabled: true,
      publicConfigJson: JSON.stringify({ appId: 'A1' }),
      status: 'misconfigured',
      lastCheckedAt: null,
      lastError: null
    })

    await expect(service.getPublicSearchConfig()).resolves.toEqual({
      enabled: false,
      provider: null,
      config: null
    })
  })

  it.each([
    [{ appId: 'bad host', searchOnlyKey: 'key', indexName: 'posts' }, 'application id'],
    [{ appId: 'APP1', searchOnlyKey: 'key', indexName: 'posts/archive' }, 'index name'],
    [{ appId: 'APP1', searchOnlyKey: 'x'.repeat(1025), indexName: 'posts' }, 'configuration']
  ])('rejects invalid Algolia public configuration: %s', async (config, _label) => {
    const { service } = createService({ ALGOLIA_ADMIN_KEY: 'admin-key' })

    await expect(
      service.update('search', 'algolia', { enabled: true, config }, ADMIN)
    ).rejects.toMatchObject({ code: 'invalid_config', statusCode: 422 })
  })

  it('tolerates a malformed publicConfigJson row by treating it as empty config', async () => {
    const repository = new FakeIntegrationRepository()
    repository.seed({
      capability: 'commentProtection',
      providerKey: 'turnstile',
      enabled: true,
      publicConfigJson: '{ not-valid-json',
      status: 'configured',
      lastCheckedAt: null,
      lastError: null
    })
    const seeded = createIntegrationService({
      integrationRepository: repository,
      env: { TURNSTILE_SECRET_KEY: 'secret' },
      now: () => NOW
    })

    // A corrupt row must never throw the whole listing; parseStoredConfig degrades to {} and the
    // provider projection renders its empty defaults.
    const views = await seeded.list(ADMIN)
    expect(find(views, 'commentProtection:turnstile').config).toEqual({ siteKey: null })
  })

  it('ignores a stored row whose capability/provider no longer matches any registration', async () => {
    const { service, repository } = createService()
    repository.seed({
      capability: 'search',
      providerKey: 'retired-provider',
      enabled: true,
      publicConfigJson: JSON.stringify({ appId: 'A1' }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null
    })

    const views = await service.list(ADMIN)

    // Listings are registry-driven: an orphaned D1 row is silently omitted, never surfaced or crashed.
    expect(views).toHaveLength(integrationRegistry.length)
    expect(views.some((view) => view.providerKey === 'retired-provider')).toBe(false)
  })

  it('returns a disabled public search config when the active row references an unknown provider', async () => {
    const { service, repository } = createService()
    repository.seed({
      capability: 'search',
      providerKey: 'retired-search',
      enabled: true,
      publicConfigJson: JSON.stringify({ appId: 'A1', searchOnlyKey: 'k', indexName: 'posts' }),
      status: 'configured',
      lastCheckedAt: null,
      lastError: null
    })

    // The row is enabled+configured but its provider is gone, so the projection must not leak an
    // unresolved config; it degrades to disabled.
    await expect(service.getPublicSearchConfig()).resolves.toEqual({
      enabled: false,
      provider: null,
      config: null
    })
  })

  it('uses the shared forbidden error shape', async () => {
    const { service } = createService()
    const expected = authError('forbidden', 'Permission denied', 403)

    await expect(service.list([])).rejects.toMatchObject({
      code: expected.code,
      message: expected.message,
      statusCode: expected.statusCode
    })
  })

  it('retries comment replica jobs using revision-conditional completion', async () => {
    const repository = new FakeIntegrationRepository()
    repository.seed({
      capability: 'commentReplica', providerKey: 'http', enabled: true,
      publicConfigJson: JSON.stringify({ endpoint: 'https://backup.example.com/comments', timeoutMs: 5000 }),
      status: 'configured', lastCheckedAt: null, lastError: null
    })
    const complete = vi.fn().mockResolvedValue(undefined)
    const service = createIntegrationService({
      integrationRepository: repository,
      env: { COMMENT_REPLICA_WEBHOOK_SECRET: 'secret', fetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })) },
      now: () => NOW,
      commentReplicaJobRepository: {
        listProviderJobs: vi.fn().mockResolvedValue([{ id: 'job-1', revision: 7, attempts: 1, payloadJson: JSON.stringify({ operation: 'remove', commentId: 'comment-1', postId: 'post-1' }) }]),
        complete,
        fail: vi.fn()
      }
    })
    await expect(service.runAction('commentReplica', 'http', 'retry', ADMIN)).resolves.toMatchObject({ status: 'active' })
    expect(complete).toHaveBeenCalledWith('job-1', 7)
  })
})
