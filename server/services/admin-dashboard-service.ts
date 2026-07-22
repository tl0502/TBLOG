import type {
  AdminContentCounts,
  AdminReadRepository
} from '../repositories/contracts/admin-read-repositories'

export interface AdminDashboardServiceDependencies {
  adminReadRepository: AdminReadRepository
}

export function createAdminDashboardService(dependencies: AdminDashboardServiceDependencies) {
  const { adminReadRepository } = dependencies

  return {
    // `publishedArticles` counts published article-type posts; `drafts` counts draft posts of any
    // type. Published page-type posts (e.g. About) are intentionally excluded from both buckets.
    getDashboardMetrics(): Promise<AdminContentCounts> {
      return adminReadRepository.getContentCounts()
    }
  }
}

export type AdminDashboardService = ReturnType<typeof createAdminDashboardService>
