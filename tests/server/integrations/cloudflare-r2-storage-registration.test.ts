import {
  cloudflareR2StorageConfigSchema,
  cloudflareR2StorageRegistration
} from '../../../server/integrations/providers/cloudflare-r2-storage'

describe('Cloudflare R2 storage registration', () => {
  it('normalizes the public base path and key prefix', () => {
    expect(cloudflareR2StorageConfigSchema.parse({
      publicBaseUrl: 'https://media.example.com/assets///',
      keyPrefix: 'uploads/2026'
    })).toEqual({
      publicBaseUrl: 'https://media.example.com/assets',
      keyPrefix: 'uploads/2026/'
    })
  })

  it.each([
    'http://media.example.com',
    'https://user:secret@media.example.com',
    'https://media.example.com?token=secret',
    'https://media.example.com#images'
  ])('rejects unsafe public base URL %s', (publicBaseUrl) => {
    expect(cloudflareR2StorageConfigSchema.safeParse({ publicBaseUrl }).success).toBe(false)
  })

  it.each([
    '/uploads/',
    '../uploads/',
    'uploads/../private/',
    'uploads?variant=large/',
    'uploads\\private/'
  ])('rejects unsafe key prefix %s', (keyPrefix) => {
    expect(cloudflareR2StorageConfigSchema.safeParse({ keyPrefix }).success).toBe(false)
  })

  it('reports invalid persisted configuration as misconfigured during a status check', () => {
    const binding = {
      async put() { return null },
      async head() { return null },
      async delete() {}
    }
    expect(cloudflareR2StorageRegistration.checkStatus(
      { publicBaseUrl: 'https://media.example.com?token=x' },
      { MEDIA_R2: binding }
    )).toMatchObject({ status: 'misconfigured' })
  })

  it('reports configuration and binding readiness without claiming public reachability', () => {
    const binding = {
      async put() { return null },
      async head() { return null },
      async delete() {}
    }
    expect(cloudflareR2StorageRegistration.checkStatus(
      { publicBaseUrl: 'https://media.example.com' },
      { MEDIA_R2: binding }
    )).toEqual({ status: 'configured' })
    expect(cloudflareR2StorageRegistration.actions).toEqual([
      { key: 'test', label: 'Check configuration and binding' }
    ])
  })
})
