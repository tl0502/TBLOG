import { setResponseHeader } from 'h3'
import type { H3Event } from 'h3'

/**
 * Dynamic public responses are not edge-cached in the baseline Worker deployment. Cloudflare does
 * not cache HTML or JSON by default, and response TTL directives alone did not make these routes
 * cacheable on the deployed Worker. Optional KV read-through caching remains independent.
 */
export function setPublicNoStoreHeaders(event: H3Event): void {
  setResponseHeader(event, 'Cache-Control', 'no-store')
}
