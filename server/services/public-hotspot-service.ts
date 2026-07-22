import type { HotspotPostReadRepository, PublicPostListItem } from '../repositories/contracts/public-read-repositories'
import type { PublicHotspotItem, PublicHotspots } from '../domain/hotspots'
import type { AnalyticsReportReader } from './analytics-report-service'

const CURRENT_HOTSPOT_LIMIT = 3
const HISTORICAL_HOTSPOT_LIMIT = 10

export interface PublicHotspotServiceDependencies {
  analyticsReportService: AnalyticsReportReader
  postReadRepository: HotspotPostReadRepository
}

function trend(current: number, previous: number): 'up' | 'steady' | 'down' {
  if (current > previous) return 'up'
  if (current < previous) return 'down'
  return 'steady'
}

export function createPublicHotspotService(dependencies: PublicHotspotServiceDependencies) {
  return {
    async getHotspots(): Promise<PublicHotspots> {
      const report = await dependencies.analyticsReportService.getCurrentReport()
      if (!report) return { current: [], historical: [] }
      const fallbackPromise = dependencies.postReadRepository.listPublishedArticles({ limit: 12 })
      const fallbackPage = await fallbackPromise
      const rankedIds = [...new Set([
        ...report.currentHotspots.map((row) => row.postId),
        ...report.historicalHotspots.map((row) => row.postId)
      ])]
      const rankedArticles = await dependencies.postReadRepository.listPublishedArticlesByIds(rankedIds)
      const resolved = new Map<string, PublicPostListItem>([
        ...fallbackPage.items.map((article) => [article.id, article] as const),
        ...rankedArticles.map((article) => [article.id, article] as const)
      ])

      const used = new Set<string>()
      const current: PublicHotspotItem[] = []
      for (const rank of report.currentHotspots) {
        const article = resolved.get(rank.postId)
        if (!article || used.has(article.id)) continue
        current.push({ article, pageViews: rank.pageViews, trend: trend(rank.pageViews, rank.previousPageViews), fallback: false })
        used.add(article.id)
        if (current.length === CURRENT_HOTSPOT_LIMIT) break
      }
      for (const article of fallbackPage.items) {
        if (current.length === CURRENT_HOTSPOT_LIMIT) break
        if (used.has(article.id)) continue
        current.push({ article, pageViews: null, trend: null, fallback: true })
        used.add(article.id)
      }

      const historicalUsed = new Set<string>()
      const historical: PublicHotspotItem[] = []
      for (const rank of report.historicalHotspots) {
        const article = resolved.get(rank.postId)
        if (!article || historicalUsed.has(article.id)) continue
        historical.push({ article, pageViews: rank.pageViews, fallback: false })
        historicalUsed.add(article.id)
        if (historical.length === HISTORICAL_HOTSPOT_LIMIT) break
      }
      for (const article of fallbackPage.items) {
        if (historical.length === HISTORICAL_HOTSPOT_LIMIT) break
        if (historicalUsed.has(article.id)) continue
        historical.push({ article, pageViews: null, fallback: true })
        historicalUsed.add(article.id)
      }

      return { current, historical }
    }
  }
}

export type PublicHotspotService = ReturnType<typeof createPublicHotspotService>
