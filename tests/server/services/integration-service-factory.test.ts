import { mergeRuntimeEnv } from '../../../server/services/integration-service-factory'

describe('integration service factory', () => {
  it('merges local process values with Cloudflare bindings, preferring bindings', () => {
    expect(mergeRuntimeEnv(
      { ANALYTICS_REPORT_TOKEN: 'local', OTHER: 'value' },
      { ANALYTICS_REPORT_TOKEN: 'cloud', DB: {} }
    )).toEqual({ ANALYTICS_REPORT_TOKEN: 'cloud', OTHER: 'value', DB: {} })
  })
})
