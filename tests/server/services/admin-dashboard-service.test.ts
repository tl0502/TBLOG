import { createAdminDashboardService } from '../../../server/services/admin-dashboard-service'
import type {
  AdminContentCounts,
  AdminReadRepository
} from '../../../server/repositories/contracts/admin-read-repositories'

const counts: AdminContentCounts = {
  publishedArticles: 4,
  drafts: 2,
  categories: 3,
  tags: 7,
  pendingComments: 5
}

describe('admin dashboard service', () => {
  it('returns the content counts from the repository', async () => {
    let calls = 0
    const repository: AdminReadRepository = {
      async getContentCounts() {
        calls += 1
        return counts
      }
    }
    const service = createAdminDashboardService({ adminReadRepository: repository })

    await expect(service.getDashboardMetrics()).resolves.toEqual(counts)
    expect(calls).toBe(1)
  })
})
