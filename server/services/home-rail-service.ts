import type { AnalyticsReportReader } from './analytics-report-service'
import type { HomeRailReadRepository } from '../repositories/contracts/home-rail-repositories'
import type { SettingsRepository } from '../repositories/contracts/settings-repositories'
import type { HomeRailCardDynamicData, HomeRailDynamicData } from '../domain/home-rail'
import { normalizeHomeSettings } from '../domain/settings'
import type {
  HomeRailPublishingRhythmCard,
  HomeRailSiteActivityCard,
  HomeRailSiteHistoryCard
} from '../../types/settings'
import { isPublicCardUrl } from '../../utils/public-url'

const DAY_MS = 86_400_000

function day(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function calendarDay(value: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(value)
    const byType = new Map(parts.map((part) => [part.type, part.value]))
    return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`
  } catch {
    return day(value)
  }
}

function monday(value: Date): Date {
  const result = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  const weekday = result.getUTCDay() || 7
  result.setUTCDate(result.getUTCDate() - weekday + 1)
  return result
}

function mondayForCalendarDay(value: string): Date {
  return monday(new Date(`${value}T00:00:00.000Z`))
}

function validStartDate(card: HomeRailSiteHistoryCard): Date | null {
  if (!card.startDate) return null
  const parsed = new Date(`${card.startDate}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function createHomeRailService(dependencies: {
  settingsRepository: SettingsRepository
  homeRailRepository: HomeRailReadRepository
  analyticsReportService: AnalyticsReportReader
}) {
  return {
    async getPublicData(now = new Date()): Promise<HomeRailDynamicData> {
      const [homeValue, site] = await Promise.all([
        dependencies.settingsRepository.getDomain('home'),
        dependencies.settingsRepository.getDomain('site')
      ])
      const home = normalizeHomeSettings(homeValue)
      const timeZone = site.timezone || 'UTC'
      const cards = home.railCards.filter((card) => card.enabled)
      const statsCards = cards.filter((card) => card.type === 'content-stats')
      const historyCards = cards.filter((card) => card.type === 'site-history')
      const rhythmCards = cards.filter((card) => card.type === 'publishing-rhythm')
      const topicCards = cards.filter((card) => card.type === 'curated-topic')
      const activityCards = cards.filter((card) => card.type === 'site-activity')
      const rhythmSince = rhythmCards.map((card) => new Date(
        mondayForCalendarDay(calendarDay(now, timeZone)).getTime() - (card.weeks - 1) * 7 * DAY_MS
      ))
      const signalCandidates = [...rhythmSince, ...activityCards.map(() => new Date(now.getTime() - 365 * DAY_MS))]
      const signalSince = signalCandidates.length
        ? new Date(Math.min(...signalCandidates.map((value) => value.getTime())))
        : null

      const topicSlugs = [...new Set(topicCards.flatMap((card) => card.articleSlugs))]
      const [counts, lastUpdated, signals, publishedTopicSlugs] = await Promise.all([
        statsCards.length ? dependencies.homeRailRepository.getContentCounts() : Promise.resolve(null),
        historyCards.length ? dependencies.homeRailRepository.getLastPublicUpdate() : Promise.resolve(null),
        signalSince ? dependencies.homeRailRepository.listArticleSignals(signalSince, 5000) : Promise.resolve([]),
        topicSlugs.length ? dependencies.homeRailRepository.listPublishedArticleSlugs(topicSlugs) : Promise.resolve([])
      ])

      let pageViews: number | null = null
      if (statsCards.some((card) => card.metrics.includes('pageViews'))) {
        pageViews = (await dependencies.analyticsReportService.getCurrentReport())?.publishedArticlePageViews ?? null
      }

      const publishedTopicSlugSet = new Set(publishedTopicSlugs)
      const dynamicCards: HomeRailDynamicData['cards'] = Object.create(null) as HomeRailDynamicData['cards']
      for (const card of cards) {
        if (card.type === 'content-stats') dynamicCards[card.instanceId] = { contentStats: counts ? { ...counts, pageViews } : null }
        if (card.type === 'site-history') dynamicCards[card.instanceId] = { siteHistory: buildHistory(card, lastUpdated, now, timeZone) }
        if (card.type === 'publishing-rhythm') {
          const since = new Date(mondayForCalendarDay(calendarDay(now, timeZone)).getTime() - (card.weeks - 1) * 7 * DAY_MS)
          dynamicCards[card.instanceId] = { publishingRhythm: buildRhythm(card, signals, since, timeZone) }
        }
        if (card.type === 'curated-topic') dynamicCards[card.instanceId] = {
          curatedTopicArticleCount: card.articleSlugs.filter((slug) => publishedTopicSlugSet.has(slug)).length
        }
        if (card.type === 'site-activity') dynamicCards[card.instanceId] = { siteActivity: buildActivity(card, signals) }
      }
      return { cards: dynamicCards }
    }
  }
}

function buildHistory(card: HomeRailSiteHistoryCard, lastUpdated: Date | null, now: Date, timeZone: string) {
  const start = validStartDate(card)
  const today = Date.parse(`${calendarDay(now, timeZone)}T00:00:00.000Z`)
  return {
    startDate: card.showStartDate && start ? day(start) : null,
    daysRunning: start ? Math.max(0, Math.floor((today - start.getTime()) / DAY_MS) + 1) : null,
    lastUpdatedAt: card.showLastUpdated && lastUpdated ? lastUpdated.toISOString() : null
  }
}

function buildRhythm(
  card: HomeRailPublishingRhythmCard,
  signals: Awaited<ReturnType<HomeRailReadRepository['listArticleSignals']>>,
  since: Date,
  timeZone: string
) {
  const points = Array.from({ length: card.weeks }, (_, index) => ({
    weekStart: day(new Date(since.getTime() + index * 7 * DAY_MS)),
    count: 0
  }))
  const byWeek = new Map(points.map((point) => [point.weekStart, point]))
  for (const signal of signals) {
    const publication = byWeek.get(day(mondayForCalendarDay(calendarDay(signal.publishedAt, timeZone))))
    if (publication) publication.count += 1
    if (card.includeUpdates && signal.updatedAt.getTime() - signal.publishedAt.getTime() > 60_000) {
      const update = byWeek.get(day(mondayForCalendarDay(calendarDay(signal.updatedAt, timeZone))))
      if (update) update.count += 1
    }
  }
  return points
}

function buildActivity(
  card: HomeRailSiteActivityCard,
  signals: Awaited<ReturnType<HomeRailReadRepository['listArticleSignals']>>
) {
  const entries: NonNullable<HomeRailCardDynamicData['siteActivity']> = card.manualEntries
    .filter((entry) => !entry.url || isPublicCardUrl(entry.url))
    .map((entry) => ({ ...entry, source: 'manual' as const }))
  for (const signal of signals) {
    const updated = signal.updatedAt.getTime() - signal.publishedAt.getTime() > 60_000
    if (card.includeUpdated && updated) {
      entries.push({
        date: signal.updatedAt.toISOString(),
        title: `更新《${signal.title}》`,
        detail: '公开文章已更新',
        url: `/posts/${signal.slug}`,
        source: 'updated'
      })
    }
    if (card.includePublished) {
      entries.push({
        date: signal.publishedAt.toISOString(),
        title: `发布《${signal.title}》`,
        detail: '新文章已公开',
        url: `/posts/${signal.slug}`,
        source: 'published'
      })
    }
  }
  return entries
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
    .slice(0, card.limit)
}

export type HomeRailService = ReturnType<typeof createHomeRailService>
