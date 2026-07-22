import { describe, expect, it } from 'vitest'
import {
  findRegistration,
  listRegistrationsByCapability
} from '../../../server/integrations/registry'
import { cloudflareKvCacheRegistration } from '../../../server/integrations/providers/cloudflare-kv-cache'
import { cloudflareR2StorageRegistration } from '../../../server/integrations/providers/cloudflare-r2-storage'
import { imageUrlTemplateRegistration } from '../../../server/integrations/providers/image-url-template'
import type {
  IntegrationSettingsRepository,
  StoredIntegration,
  UpsertIntegrationRecord
} from '../../../server/repositories/contracts/integration-repositories'
import { createIntegrationService } from '../../../server/services/integration-service'
import type { Permission } from '../../../server/services/permissions'

const ADMIN: Permission[] = ['integration:*']
const NOW = new Date('2026-07-15T00:00:00.000Z')

class FakeIntegrationRepository implements IntegrationSettingsRepository {
  rows = new Map<string, StoredIntegration>()
  upserts: UpsertIntegrationRecord[] = []
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
    await this.upsert(record)
  }
  async upsertExclusive(record: UpsertIntegrationRecord) {
    await this.upsert(record)
  }
  async upsertAnalyticsReportExclusive(record: UpsertIntegrationRecord) {
    await this.upsertExclusive(record)
  }
  async touch() {}
}

describe('media/storage/cache registrations', () => {
  it('registers each new provider under its capability', () => {
    expect(findRegistration('cache', 'cloudflare-kv')).toBe(cloudflareKvCacheRegistration)
    expect(findRegistration('storage', 'cloudflare-r2')).toBe(cloudflareR2StorageRegistration)
    expect(findRegistration('image', 'url-template')).toBe(imageUrlTemplateRegistration)
    expect(listRegistrationsByCapability('cache')).toHaveLength(1)
    expect(listRegistrationsByCapability('storage')).toHaveLength(1)
    expect(listRegistrationsByCapability('image')).toHaveLength(1)
  })

  it('KV cache reports unavailable without the binding and active with it', () => {
    expect(cloudflareKvCacheRegistration.checkStatus({}, {})).toMatchObject({ status: 'unavailable' })
    expect(cloudflareKvCacheRegistration.checkStatus({}, {
      CACHE_KV: { get() {}, put() {}, delete() {} }
    })).toEqual({ status: 'active' })
  })

  it('R2 storage reports unavailable, misconfigured, or configured by binding and config', () => {
    const binding = {
      async put() { return null },
      async head() { return null },
      async delete() {}
    }
    expect(cloudflareR2StorageRegistration.checkStatus({}, {})).toMatchObject({ status: 'unavailable' })
    expect(cloudflareR2StorageRegistration.checkStatus({}, { MEDIA_R2: binding })).toMatchObject({
      status: 'misconfigured'
    })
    expect(
      cloudflareR2StorageRegistration.checkStatus(
        { publicBaseUrl: 'https://media.example.com' },
        { MEDIA_R2: binding }
      )
    ).toEqual({ status: 'configured' })
  })

  it('R2 storage rejects a non-https public base URL', () => {
    expect(cloudflareR2StorageRegistration.validate({ publicBaseUrl: 'http://media.example.com' })).toMatch(
      /https/
    )
    expect(cloudflareR2StorageRegistration.validate({ publicBaseUrl: 'https://media.example.com' })).toBeNull()
  })

  it('image templates require the {url} placeholder', () => {
    expect(imageUrlTemplateRegistration.validate({ thumbnail: 'https://img.example.com/w=100/{url}' })).toBeNull()
    expect(imageUrlTemplateRegistration.validate({ thumbnail: 'https://img.example.com/static.png' })).toMatch(
      /\{url\}/
    )
  })

  it('image capability is misconfigured until at least one template is set', () => {
    expect(imageUrlTemplateRegistration.checkStatus({}, {})).toMatchObject({ status: 'misconfigured' })
    expect(
      imageUrlTemplateRegistration.checkStatus({ medium: 'https://img.example.com/{url}' }, {})
    ).toEqual({ status: 'active' })
  })

  it('keeps KV disabled and unavailable when enabled without the binding', async () => {
    const repository = new FakeIntegrationRepository()
    const service = createIntegrationService({ integrationRepository: repository, env: {}, now: () => NOW })

    const view = await service.update('cache', 'cloudflare-kv', { enabled: true, config: { ttlSeconds: '300' } }, ADMIN)

    expect(view).toMatchObject({ enabled: false, status: 'unavailable' })
    expect(view.lastError).toContain('CACHE_KV')
  })

  it('enables KV as configured with the binding and coerces the TTL string to a number', async () => {
    const repository = new FakeIntegrationRepository()
    const service = createIntegrationService({
      integrationRepository: repository,
      env: { CACHE_KV: {} },
      now: () => NOW
    })

    const view = await service.update(
      'cache',
      'cloudflare-kv',
      { enabled: true, config: { ttlSeconds: '300', keyPrefix: 'tblog:' } },
      ADMIN
    )

    expect(view).toMatchObject({ enabled: true, status: 'configured' })
    expect(JSON.parse(repository.upserts.at(-1)!.publicConfigJson)).toEqual({
      ttlSeconds: 300,
      keyPrefix: 'tblog:'
    })
  })
})
