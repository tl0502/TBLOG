import { describe, expect, it } from 'vitest'
import {
  cloudflareKvCacheRegistration,
  isKvNamespaceBinding
} from '../../../server/integrations/providers/cloudflare-kv-cache'

const validKv = {
  async get() { return null },
  async put() {},
  async delete() {}
}

describe('Cloudflare KV cache registration', () => {
  it('uses the runtime KV method contract for readiness', () => {
    expect(isKvNamespaceBinding(validKv)).toBe(true)
    expect(isKvNamespaceBinding({})).toBe(false)
    expect(cloudflareKvCacheRegistration.checkStatus({}, { CACHE_KV: validKv }))
      .toEqual({ status: 'active' })
    expect(cloudflareKvCacheRegistration.checkStatus({}, { CACHE_KV: {} }))
      .toMatchObject({ status: 'unavailable' })
  })
})
