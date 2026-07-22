import { describe, expect, it, vi } from 'vitest'
import { createHomeRailService } from '../../../server/services/home-rail-service'
import { settingsDefaults } from '../../../server/domain/settings'
import { homeRailCardCatalogDefaults } from '../../../types/settings'

function home() {
  return {
    railCards: homeRailCardCatalogDefaults
      .filter((card) => ['content-stats', 'site-history', 'publishing-rhythm', 'curated-topic', 'site-activity'].includes(card.type))
      .map((card) => {
      if (card.type === 'content-stats') return { ...card, enabled: true }
      if (card.type === 'site-history') return { ...card, enabled: true, startDate: '2026-07-01' }
      if (card.type === 'publishing-rhythm') return { ...card, enabled: true, includeUpdates: true }
      if (card.type === 'curated-topic') return { ...card, enabled: true, articleSlugs: ['one', 'draft'] }
      if (card.type === 'site-activity') return { ...card, enabled: true, limit: 4 }
      return card
      })
  }
}

function setup(reportAvailable = true) {
  const getCurrentReport = vi.fn().mockResolvedValue(reportAvailable ? { publishedArticlePageViews: 4321 } : null)
  const service = createHomeRailService({
    settingsRepository: {
      getDomain: vi.fn().mockImplementation((domain: string) => Promise.resolve(
        domain === 'home' ? home() : { ...settingsDefaults.site, timezone: 'Asia/Shanghai' }
      ))
    } as never,
    homeRailRepository: {
      getContentCounts: vi.fn().mockResolvedValue({ articles: 12, categories: 3, tags: 8 }),
      getLastPublicUpdate: vi.fn().mockResolvedValue(new Date('2026-07-16T08:00:00Z')),
      listPublishedArticleSlugs: vi.fn().mockResolvedValue(['one']),
      listArticleSignals: vi.fn().mockResolvedValue([{
        slug: 'one', title: 'One', publishedAt: new Date('2026-07-14T08:00:00Z'),
        updatedAt: new Date('2026-07-16T08:00:00Z')
      }])
    },
    analyticsReportService: { getCurrentReport } as never
  })
  return { service, getCurrentReport }
}

describe('home rail service', () => {
  it('composes published content data and published report totals', async () => {
    const { service, getCurrentReport } = setup()
    const result = await service.getPublicData(new Date('2026-07-17T12:00:00Z'))

    expect(result.cards['template-content-stats']?.contentStats).toEqual({ articles: 12, categories: 3, tags: 8, pageViews: 4321 })
    expect(result.cards['template-site-history']?.siteHistory).toMatchObject({ startDate: '2026-07-01', daysRunning: 17 })
    expect(result.cards['template-curated-topic']?.curatedTopicArticleCount).toBe(1)
    expect(result.cards['template-publishing-rhythm']?.publishingRhythm?.reduce((sum, point) => sum + point.count, 0)).toBe(2)
    expect(result.cards['template-site-activity']?.siteActivity?.[0]).toMatchObject({ source: 'updated', url: '/posts/one' })
    expect(getCurrentReport).toHaveBeenCalledOnce()
  })

  it('omits page views when no report has been published', async () => {
    const { service, getCurrentReport } = setup(false)
    const result = await service.getPublicData(new Date('2026-07-17T12:00:00Z'))

    expect(result.cards['template-content-stats']?.contentStats?.pageViews).toBeNull()
    expect(getCurrentReport).toHaveBeenCalledOnce()
  })

  it('keeps dynamic results separate for repeated card types', async () => {
    const listPublishedArticleSlugs = vi.fn().mockResolvedValue(['one', 'two'])
    const service = createHomeRailService({
      settingsRepository: { getDomain: vi.fn().mockImplementation((domain: string) => Promise.resolve(domain === 'home' ? {
        railCards: [
          { instanceId: 'topic-a', type: 'curated-topic', enabled: true, size: 'normal', title: 'A', eyebrow: '', topicTitle: 'A', summary: '', coverUrl: null, targetUrl: '', articleSlugs: ['one'] },
          { instanceId: 'topic-b', type: 'curated-topic', enabled: true, size: 'normal', title: 'B', eyebrow: '', topicTitle: 'B', summary: '', coverUrl: null, targetUrl: '', articleSlugs: ['one', 'two'] }
        ]
      } : settingsDefaults.site)) } as never,
      homeRailRepository: {
        getContentCounts: vi.fn(), getLastPublicUpdate: vi.fn(), listArticleSignals: vi.fn(), listPublishedArticleSlugs
      } as never,
      analyticsReportService: { getCurrentReport: vi.fn().mockResolvedValue(null) } as never
    })

    const result = await service.getPublicData(new Date('2026-07-17T12:00:00Z'))

    expect(result.cards['topic-a']?.curatedTopicArticleCount).toBe(1)
    expect(result.cards['topic-b']?.curatedTopicArticleCount).toBe(2)
    expect(listPublishedArticleSlugs).toHaveBeenCalledTimes(1)
  })
})
