import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatabaseClient } from '../../../server/database/client'
import { createCacheProviderForEvent } from '../../../server/providers/cache/cache-provider-factory'
import { createHomeRailReadRepository } from '../../../server/repositories/home-rail-read-repository'
import { createPostReadRepository } from '../../../server/repositories/post-read-repository'
import { createSettingsRepository } from '../../../server/repositories/settings-repository'
import { createTaxonomyReadRepository } from '../../../server/repositories/taxonomy-read-repository'
import { createHomeRailService } from '../../../server/services/home-rail-service'
import { createPublicContentService } from '../../../server/services/public-content-service'
import { createPublicHomeBootstrapService } from '../../../server/services/public-home-bootstrap-service'
import { createPublicHotspotService } from '../../../server/services/public-hotspot-service'
import { createTaxonomyReadService } from '../../../server/services/taxonomy-read-service'
import { createAnalyticsReportReaderForEvent } from '../../../server/services/analytics-report-reader-factory'

vi.mock('../../../server/database/client', () => ({ getDatabaseClient: vi.fn() }))
vi.mock('../../../server/providers/cache/cache-provider-factory', () => ({
  createCacheProviderForEvent: vi.fn()
}))
vi.mock('../../../server/repositories/home-rail-read-repository', () => ({
  createHomeRailReadRepository: vi.fn()
}))
vi.mock('../../../server/repositories/post-read-repository', () => ({
  createPostReadRepository: vi.fn()
}))
vi.mock('../../../server/repositories/settings-repository', () => ({
  createSettingsRepository: vi.fn()
}))
vi.mock('../../../server/repositories/taxonomy-read-repository', () => ({
  createTaxonomyReadRepository: vi.fn()
}))
vi.mock('../../../server/services/home-rail-service', () => ({ createHomeRailService: vi.fn() }))
vi.mock('../../../server/services/public-content-service', () => ({ createPublicContentService: vi.fn() }))
vi.mock('../../../server/services/public-home-bootstrap-service', () => ({
  createPublicHomeBootstrapService: vi.fn()
}))
vi.mock('../../../server/services/public-hotspot-service', () => ({ createPublicHotspotService: vi.fn() }))
vi.mock('../../../server/services/taxonomy-read-service', () => ({ createTaxonomyReadService: vi.fn() }))
vi.mock('../../../server/services/analytics-report-reader-factory', () => ({
  createAnalyticsReportReaderForEvent: vi.fn()
}))

import { createPublicHomeBootstrapServiceForEvent } from '../../../server/services/public-home-bootstrap-service-factory'

describe('public home bootstrap service factory', () => {
  beforeEach(() => vi.resetAllMocks())

  it('shares request-scoped cache, post, and analytics instances across component services', async () => {
    const event = { context: {} }
    const db = { kind: 'db' }
    const cache = { kind: 'cache' }
    const postReadRepository = { kind: 'posts' }
    const analyticsReportService = { kind: 'analytics-report' }
    const settingsRepository = { kind: 'settings' }
    const homeRailRepository = { kind: 'rail' }
    const taxonomyReadRepository = { kind: 'taxonomy' }
    const publicContentService = {
      getHomeFeed: vi.fn().mockResolvedValue('feed'),
      getFeaturedPosts: vi.fn().mockResolvedValue('featured')
    }
    const publicHotspotService = { getHotspots: vi.fn().mockResolvedValue('hotspots') }
    const homeRailService = { getPublicData: vi.fn().mockResolvedValue('rail') }
    const taxonomyReadService = { getTags: vi.fn().mockResolvedValue('tags') }
    const bootstrapService = { getBootstrap: vi.fn() }

    vi.mocked(getDatabaseClient).mockReturnValue(db as never)
    vi.mocked(createCacheProviderForEvent).mockReturnValue(cache as never)
    vi.mocked(createPostReadRepository).mockReturnValue(postReadRepository as never)
    vi.mocked(createAnalyticsReportReaderForEvent).mockReturnValue(analyticsReportService as never)
    vi.mocked(createSettingsRepository).mockReturnValue(settingsRepository as never)
    vi.mocked(createHomeRailReadRepository).mockReturnValue(homeRailRepository as never)
    vi.mocked(createTaxonomyReadRepository).mockReturnValue(taxonomyReadRepository as never)
    vi.mocked(createPublicContentService).mockReturnValue(publicContentService as never)
    vi.mocked(createPublicHotspotService).mockReturnValue(publicHotspotService as never)
    vi.mocked(createHomeRailService).mockReturnValue(homeRailService as never)
    vi.mocked(createTaxonomyReadService).mockReturnValue(taxonomyReadService as never)
    vi.mocked(createPublicHomeBootstrapService).mockReturnValue(bootstrapService as never)

    expect(createPublicHomeBootstrapServiceForEvent(event as never)).toBe(bootstrapService)

    expect(createCacheProviderForEvent).toHaveBeenCalledOnce()
    expect(createPostReadRepository).toHaveBeenCalledOnce()
    expect(createAnalyticsReportReaderForEvent).toHaveBeenCalledWith(event)
    expect(createPublicContentService).toHaveBeenCalledWith({
      postReadRepository,
      featuredPostReadRepository: postReadRepository,
      analyticsReportService,
      cache
    })
    expect(createPublicHotspotService).toHaveBeenCalledWith({
      analyticsReportService,
      postReadRepository
    })
    expect(createHomeRailService).toHaveBeenCalledWith({
      settingsRepository,
      homeRailRepository,
      analyticsReportService
    })
    expect(createTaxonomyReadService).toHaveBeenCalledWith({
      postReadRepository,
      taxonomyReadRepository,
      cache
    })

    const orchestration = vi.mocked(createPublicHomeBootstrapService).mock.calls[0]?.[0]
    const query = { page: 1, limit: 25, sort: 'publishedAt' as const, order: 'desc' as const }
    await expect(orchestration?.getFeed(query)).resolves.toBe('feed')
    await expect(orchestration?.getFeatured()).resolves.toBe('featured')
    await expect(orchestration?.getHotspots()).resolves.toBe('hotspots')
    await expect(orchestration?.getHomeRail()).resolves.toBe('rail')
    await expect(orchestration?.getTags()).resolves.toBe('tags')
  })

  it('constructs fresh shared instances for each request', () => {
    const firstDb = { request: 1 }
    const secondDb = { request: 2 }
    vi.mocked(getDatabaseClient)
      .mockReturnValueOnce(firstDb as never)
      .mockReturnValueOnce(secondDb as never)
    vi.mocked(createCacheProviderForEvent).mockReturnValue({} as never)
    vi.mocked(createPostReadRepository).mockReturnValue({} as never)
    vi.mocked(createAnalyticsReportReaderForEvent).mockReturnValue({} as never)
    vi.mocked(createSettingsRepository).mockReturnValue({} as never)
    vi.mocked(createHomeRailReadRepository).mockReturnValue({} as never)
    vi.mocked(createTaxonomyReadRepository).mockReturnValue({} as never)
    vi.mocked(createPublicContentService).mockReturnValue({
      getHomeFeed: vi.fn(), getFeaturedPosts: vi.fn()
    } as never)
    vi.mocked(createPublicHotspotService).mockReturnValue({ getHotspots: vi.fn() } as never)
    vi.mocked(createHomeRailService).mockReturnValue({ getPublicData: vi.fn() } as never)
    vi.mocked(createTaxonomyReadService).mockReturnValue({ getTags: vi.fn() } as never)
    vi.mocked(createPublicHomeBootstrapService).mockReturnValue({ getBootstrap: vi.fn() } as never)

    createPublicHomeBootstrapServiceForEvent({ context: { request: 1 } } as never)
    createPublicHomeBootstrapServiceForEvent({ context: { request: 2 } } as never)

    expect(createCacheProviderForEvent).toHaveBeenCalledTimes(2)
    expect(createPostReadRepository).toHaveBeenNthCalledWith(1, firstDb)
    expect(createPostReadRepository).toHaveBeenNthCalledWith(2, secondDb)
    expect(createAnalyticsReportReaderForEvent).toHaveBeenCalledTimes(2)
  })
})
