import { createConfiguredSearchProvider } from '../../../server/providers/search/search-provider-factory'

describe('search provider factory', () => {
  it('rejects malformed legacy Algolia host and index values at the provider boundary', () => {
    expect(createConfiguredSearchProvider({
      config: { appId: 'APPID.example/path', indexName: 'posts' },
      env: { ALGOLIA_ADMIN_KEY: 'admin' }
    })).toBeNull()

    expect(createConfiguredSearchProvider({
      config: { appId: 'APPID', indexName: '../posts' },
      env: { ALGOLIA_ADMIN_KEY: 'admin' }
    })).toBeNull()
  })

  it('creates the provider only for complete valid Algolia settings', () => {
    expect(createConfiguredSearchProvider({
      config: { appId: 'APPID', indexName: 'posts' },
      env: { ALGOLIA_ADMIN_KEY: 'admin' }
    })).not.toBeNull()
  })
})
