<script setup lang="ts">
import { computed } from 'vue'
import HomeRailCards from '~/components/home/HomeRailCards.vue'
import type { HomeRailCardDataView, HomeRailDataView, TagView } from '~/types/public-view'
import type { HomeRailCard, PublicHomeRailCard } from '~/types/settings'

const props = defineProps<{ card: HomeRailCard }>()

const tags: TagView[] = [
  { slug: 'nuxt', name: 'Nuxt' },
  { slug: 'cloudflare', name: 'Cloudflare' },
  { slug: 'design', name: 'Design' },
  { slug: 'architecture', name: 'Architecture' }
]

const representativeActivity: NonNullable<HomeRailCardDataView['siteActivity']> = [
  { date: '2026-07-18T08:00:00.000Z', title: '更新《卡片体系设计》', detail: '公开文章已更新', url: '/posts/card-design', source: 'updated' },
  { date: '2026-07-15T08:00:00.000Z', title: '发布《构建独立博客》', detail: '新文章已公开', url: '/posts/indie-blog', source: 'published' }
]
const rhythmPoints = Array.from({ length: 12 }, (_, index) => ({
  weekStart: new Date(Date.UTC(2026, 4, 4 + index * 7)).toISOString().slice(0, 10),
  count: [1, 3, 0, 2, 4, 2, 1, 5, 2, 3, 1, 4][index] ?? 0
}))

const data = computed<HomeRailDataView>(() => {
  const card = props.card
  const previewData: HomeRailCardDataView = {
  contentStats: { articles: 48, categories: 6, tags: 19, pageViews: 12840 },
  siteHistory: {
      startDate: card.type === 'site-history' && card.showStartDate ? card.startDate : null,
      daysRunning: card.type === 'site-history' && card.startDate ? 930 : null,
      lastUpdatedAt: card.type === 'site-history' && card.showLastUpdated ? '2026-07-18T08:00:00.000Z' : null
  },
    publishingRhythm: card.type === 'publishing-rhythm' ? rhythmPoints.slice(-card.weeks) : rhythmPoints,
    curatedTopicArticleCount: card.type === 'curated-topic' ? card.articleSlugs.length : 8,
    siteActivity: card.type === 'site-activity'
      ? [
          ...card.manualEntries.map((entry) => ({ ...entry, source: 'manual' as const })),
          ...(card.includeUpdated ? representativeActivity.filter((entry) => entry.source === 'updated') : []),
          ...(card.includePublished ? representativeActivity.filter((entry) => entry.source === 'published') : [])
        ].slice(0, card.limit)
      : representativeActivity
  }
  return { cards: { [card.instanceId]: previewData } }
})

const previewCard = computed<PublicHomeRailCard>(() => {
  if (props.card.type === 'curated-topic') {
    const { enabled: _enabled, articleSlugs: _articleSlugs, ...card } = props.card
    return card
  }
  if (props.card.type === 'reading-series') {
    const { enabled: _enabled, ...card } = props.card
    return { ...card, chapters: card.chapters.filter((chapter) => chapter.published) }
  }
  const { enabled: _enabled, ...card } = props.card
  return card
})
</script>

<template>
  <div class="home-card-preview" data-test="home-card-preview">
    <p class="home-card-preview__label">当前草稿预览</p>
    <div class="home-card-preview__rail">
      <HomeRailCards :cards="[previewCard]" :tags="tags" :data="data" preview />
    </div>
    <p class="home-card-preview__note">动态内容使用代表性预览数据；保存后首页会读取真实公开数据。</p>
  </div>
</template>

<style scoped>
.home-card-preview{display:grid;gap:10px;padding:16px;border:1px dashed rgba(var(--color-accent-rgb),.38);border-radius:12px;background:rgba(var(--color-accent-rgb),.035)}
.home-card-preview__label,.home-card-preview__note{margin:0;color:var(--color-muted);font-size:.72rem}.home-card-preview__label{color:var(--color-accent);font-weight:800}.home-card-preview__rail{width:min(100%,300px)}
</style>
