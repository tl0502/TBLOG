import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSearchSyncRetryServiceForBindings } from '../../../server/services/search-sync-retry-service-factory'
import { createAnalyticsReportServiceForBindings } from '../../../server/services/analytics-report-service-factory'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineTask = (task: unknown) => task
})

vi.mock('../../../server/services/search-sync-retry-service-factory', () => ({
  createSearchSyncRetryServiceForBindings: vi.fn()
}))

vi.mock('../../../server/services/analytics-report-service-factory', () => ({
  createAnalyticsReportServiceForBindings: vi.fn()
}))

import searchSyncTask from '../../../server/tasks/search/sync'
import analyticsReportTask from '../../../server/tasks/analytics/report-sync'

const bindings = { DB: {} as D1Database, ALGOLIA_ADMIN_KEY: 'secret' }
const taskEvent = { name: 'test', payload: {}, context: { cloudflare: { env: bindings } } }

beforeEach(() => vi.resetAllMocks())

describe('main Worker scheduled tasks', () => {
  it('processes one bounded search retry batch using Worker bindings', async () => {
    const processBatch = vi.fn().mockResolvedValue({ claimed: 1, succeeded: 1 })
    vi.mocked(createSearchSyncRetryServiceForBindings).mockResolvedValue({ processBatch } as never)

    await expect(searchSyncTask.run(taskEvent)).resolves.toEqual({
      result: { claimed: 1, succeeded: 1 }
    })
    expect(createSearchSyncRetryServiceForBindings).toHaveBeenCalledWith(bindings)
    expect(processBatch).toHaveBeenCalledWith(10)
  })

  it('refreshes due analytics reports directly using Worker bindings', async () => {
    const syncDue = vi.fn().mockResolvedValue({ due: false, activeRevision: 'rev-1' })
    vi.mocked(createAnalyticsReportServiceForBindings).mockReturnValue({ syncDue } as never)

    await expect(analyticsReportTask.run(taskEvent)).resolves.toEqual({
      result: { due: false, activeRevision: 'rev-1' }
    })
    expect(createAnalyticsReportServiceForBindings).toHaveBeenCalledWith(bindings)
    expect(syncDue).toHaveBeenCalledOnce()
  })
})
