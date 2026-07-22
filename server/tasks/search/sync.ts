import { createSearchSyncRetryServiceForBindings } from '../../services/search-sync-retry-service-factory'

interface CloudflareTaskContext {
  cloudflare?: {
    env?: Record<string, unknown> & { DB?: D1Database }
  }
}

export default defineTask({
  meta: {
    name: 'search:sync',
    description: 'Process a bounded batch of pending search synchronization jobs'
  },
  async run(event) {
    const env = (event.context as CloudflareTaskContext).cloudflare?.env
    if (!env?.DB) throw new Error('D1 binding DB is not available')
    const service = await createSearchSyncRetryServiceForBindings({ ...env, DB: env.DB })
    return { result: await service.processBatch(10) }
  }
})
