import { describe, expect, it } from 'vitest'
import { mergeRuntimeEnv } from '../../../server/services/settings-service-factory'

describe('settings service runtime environment', () => {
  it('keeps local process env values when Cloudflare only provides bindings', () => {
    const merged = mergeRuntimeEnv(
      { ANALYTICS_REPORT_TOKEN: 'local-secret', SESSION_SECRET: 'session-secret' },
      { DB: {} }
    )

    expect(merged).toMatchObject({
      ANALYTICS_REPORT_TOKEN: 'local-secret',
      SESSION_SECRET: 'session-secret',
      DB: {}
    })
  })

  it('prefers explicitly configured Cloudflare values', () => {
    const merged = mergeRuntimeEnv(
      { ANALYTICS_REPORT_TOKEN: 'local-secret' },
      { ANALYTICS_REPORT_TOKEN: 'cloudflare-secret' }
    )

    expect(merged.ANALYTICS_REPORT_TOKEN).toBe('cloudflare-secret')
  })
})
