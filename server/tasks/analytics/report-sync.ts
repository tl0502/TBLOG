import { createAnalyticsReportServiceForBindings } from '../../services/analytics-report-service-factory'

interface CloudflareTaskContext {
  cloudflare?: {
    env?: Record<string, unknown> & { DB?: D1Database }
  }
}

export default defineTask({
  meta: {
    name: 'analytics:report-sync',
    description: 'Refresh the published analytics report when its configured schedule is due'
  },
  async run(event) {
    const env = (event.context as CloudflareTaskContext).cloudflare?.env
    if (!env?.DB) throw new Error('D1 binding DB is not available')
    const service = createAnalyticsReportServiceForBindings({ ...env, DB: env.DB })
    return { result: await service.syncDue() }
  }
})
