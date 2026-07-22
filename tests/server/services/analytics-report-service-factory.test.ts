import { mergeAnalyticsReportRuntimeEnv } from '../../../server/services/analytics-report-service-factory'

describe('analytics report service factory', () => {
  it('merges local process secrets with Cloudflare bindings, preferring deployed bindings', () => {
    expect(mergeAnalyticsReportRuntimeEnv(
      { UMAMI_API_TOKEN: 'local', PLAUSIBLE_API_KEY: 'local-key' },
      { UMAMI_API_TOKEN: 'cloud', DB: {} }
    )).toEqual({
      UMAMI_API_TOKEN: 'cloud',
      PLAUSIBLE_API_KEY: 'local-key',
      DB: {}
    })
  })
})
