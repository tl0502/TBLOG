import type { Component } from 'vue'
import BuildLogCard from '~/components/home/BuildLogCard.vue'
import ContentStatsCard from '~/components/home/ContentStatsCard.vue'
import CuratedTopicCard from '~/components/home/CuratedTopicCard.vue'
import FriendLinksCard from '~/components/home/FriendLinksCard.vue'
import NavigationCard from '~/components/home/NavigationCard.vue'
import PublishingRhythmCard from '~/components/home/PublishingRhythmCard.vue'
import ReadingSeriesCard from '~/components/home/ReadingSeriesCard.vue'
import SiteActivityCard from '~/components/home/SiteActivityCard.vue'
import SiteHistoryCard from '~/components/home/SiteHistoryCard.vue'
import TagCard from '~/components/home/TagCard.vue'
import type { HomeRailDataView, TagView } from '~/types/public-view'
import type { PublicHomeRailCard } from '~/types/settings'

interface HomeRailCardRegistration {
  component: Component
  props: (card: PublicHomeRailCard, context: { tags: TagView[]; data: HomeRailDataView | null; preview: boolean }) => Record<string, unknown>
}

export const homeRailCardRegistry: Record<PublicHomeRailCard['type'], HomeRailCardRegistration> = {
  tags: {
    component: TagCard,
    props: (card, context) => card.type === 'tags'
      ? { tags: context.tags, title: card.title, collapsedCount: card.collapsedCount, size: card.size }
      : {}
  },
  'build-log': {
    component: BuildLogCard,
    props: (card) => card.type === 'build-log'
      ? { title: card.title, entries: card.entries.map((label) => ({ label })), size: card.size }
      : {}
  },
  'content-stats': {
    component: ContentStatsCard,
    props: (card, context) => card.type === 'content-stats'
      ? { title: card.title, size: card.size, metrics: card.metrics, data: context.data?.cards[card.instanceId]?.contentStats ?? null }
      : {}
  },
  'site-history': {
    component: SiteHistoryCard,
    props: (card, context) => card.type === 'site-history'
      ? { title: card.title, size: card.size, data: context.data?.cards[card.instanceId]?.siteHistory ?? null }
      : {}
  },
  'publishing-rhythm': {
    component: PublishingRhythmCard,
    props: (card, context) => card.type === 'publishing-rhythm'
      ? { title: card.title, size: card.size, points: context.data?.cards[card.instanceId]?.publishingRhythm ?? [] }
      : {}
  },
  'friend-links': {
    component: FriendLinksCard,
    props: (card) => card.type === 'friend-links'
      ? { title: card.title, size: card.size, links: card.links }
      : {}
  },
  navigation: {
    component: NavigationCard,
    props: (card) => card.type === 'navigation'
      ? { title: card.title, size: card.size, groups: card.groups }
      : {}
  },
  'curated-topic': {
    component: CuratedTopicCard,
    props: (card, context) => card.type === 'curated-topic'
      ? {
          title: card.title, size: card.size, eyebrow: card.eyebrow, topicTitle: card.topicTitle,
          summary: card.summary, coverUrl: card.coverUrl, targetUrl: card.targetUrl,
          articleCount: context.data?.cards[card.instanceId]?.curatedTopicArticleCount ?? null
        }
      : {}
  },
  'reading-series': {
    component: ReadingSeriesCard,
    props: (card, context) => card.type === 'reading-series'
      ? { title: card.title, size: card.size, seriesTitle: card.seriesTitle, status: card.status, chapters: card.chapters, showProgress: card.showProgress, storageEnabled: !context.preview }
      : {}
  },
  'site-activity': {
    component: SiteActivityCard,
    props: (card, context) => card.type === 'site-activity'
      ? { title: card.title, size: card.size, entries: context.data?.cards[card.instanceId]?.siteActivity ?? [] }
      : {}
  }
}
