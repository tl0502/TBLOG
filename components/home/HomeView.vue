<script setup lang="ts">
import { computed } from 'vue'
import ArticleCard from '~/components/article/ArticleCard.vue'
import HomeRailCards from '~/components/home/HomeRailCards.vue'
import HomeIntro from '~/components/home/HomeIntro.vue'
import PersonalCard from '~/components/home/PersonalCard.vue'
import HotspotStatsCard from '~/components/home/HotspotStatsCard.vue'
import HomeFeedSortControl from '~/components/home/HomeFeedSortControl.vue'
import HomeFeedPagination from '~/components/home/HomeFeedPagination.vue'
import type { ArticleListItemView, HomeRailDataView, HotspotsView, TagView } from '~/types/public-view'
import type { HomeFeedMeta } from '~/types/home-feed'
import type { PublicHomeRailCard, PublicProfile } from '~/types/settings'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  feed: ArticleListItemView[]
  feedMeta?: HomeFeedMeta
  /** Soft-revalidate in flight (pagination/sort); keeps prior feed visible with a busy signal. */
  feedRevalidating?: boolean
  featured?: ArticleListItemView[]
  hotspots?: HotspotsView | null
  tags: TagView[]
  profile?: PublicProfile | null
  fallbackCover?: string | null
  railCards?: PublicHomeRailCard[]
  railData?: HomeRailDataView | null
  statisticsAvailable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  featured: () => [],
  feedMeta: () => ({ page: 1, pageSize: 25, total: 0, pageCount: 0, sort: 'publishedAt', order: 'desc' }),
  feedRevalidating: false,
  hotspots: null,
  profile: null,
  fallbackCover: null,
  railData: null,
  railCards: () => [
    { instanceId: 'default-tags', type: 'tags', size: 'normal', title: 'Tags', collapsedCount: 12 },
    {
      instanceId: 'default-build-log',
      type: 'build-log',
      size: 'normal',
      title: 'Build Log',
      entries: ['Public read APIs and cache boundaries', 'Public frontend foundation']
    }
  ],
  statisticsAvailable: false
})
const { t } = useTblogI18n()

const pinned = computed(() => props.featured[0] ?? props.feed[0] ?? null)
const carouselArticles = computed(() => props.featured.length ? props.featured : (pinned.value ? [pinned.value] : []))
const effectiveSort = computed(() => props.feedMeta.effectiveSort ?? props.feedMeta.sort)
const effectiveOrder = computed(() => effectiveSort.value === props.feedMeta.sort ? props.feedMeta.order : 'desc')
</script>

<template>
  <div class="container home">
    <section class="home__intro">
      <HomeIntro :articles="carouselArticles" :fallback-cover="props.fallbackCover" />
      <HotspotStatsCard v-if="props.hotspots && (props.hotspots.current.length || props.hotspots.historical.length)" :hotspots="props.hotspots" />
    </section>

    <div class="home__body">
      <aside class="home__rail">
        <PersonalCard :profile="props.profile" />
        <HomeRailCards :cards="props.railCards" :tags="tags" :data="props.railData" />
      </aside>

      <main
        id="articles"
        class="home__feed"
        :class="{ 'home__feed--revalidating': props.feedRevalidating }"
        :aria-busy="props.feedRevalidating ? 'true' : undefined"
      >
        <div class="home__feed-head">
          <h2 class="home__feed-title">{{ t('home.latest') }}</h2>
          <div class="home__feed-controls">
            <HomeFeedSortControl :sort="effectiveSort" :order="effectiveOrder" :statistics-available="props.statisticsAvailable" />
          </div>
        </div>

        <ArticleCard v-for="article in feed" :key="article.id" :article="article" />

        <p v-if="!feed.length" class="home__empty">{{ t('home.noArticles') }}</p>

        <HomeFeedPagination
          :page="props.feedMeta.page"
          :page-count="props.feedMeta.pageCount"
          :sort="effectiveSort"
          :order="effectiveOrder"
        />
      </main>
    </div>
  </div>
</template>

<style scoped>
.home {
  width: min(100%, 1180px);
  padding-block: 28px 72px;
}

.home__intro {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 20px;
  height: 360px;
  margin-bottom: 24px;
}

.home__body {
  display: grid;
  grid-template-columns: minmax(270px, 26fr) minmax(0, 74fr);
  gap: 28px;
  align-items: start;
}

.home__rail {
  position: sticky;
  top: 88px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  z-index: 1;
}

.home__intro:has(> :only-child) {
  grid-template-columns: 1fr;
}

.home__rail :deep(.sidebar-card + .sidebar-card) {
  margin-top: 0;
}

.home__rail :deep(.sidebar-card) {
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

/* Sticky rail: no translateY — quiet hover keeps the column from "bobbing". */
@media (hover: hover) and (pointer: fine) {
  .home__rail :deep(.sidebar-card:hover) {
    border-color: rgba(var(--color-accent-rgb), 0.36);
    box-shadow: var(--shadow-card-hover);
  }
}

.home__feed {
  display: flex;
  flex-direction: column;
  gap: 14px;
  scroll-margin-top: 88px;
  transition: opacity 0.18s ease;
}

.home__feed--revalidating {
  opacity: 0.72;
  pointer-events: none;
}

.home__feed-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.home__feed-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.12rem;
}

.home__empty {
  color: var(--color-muted);
}

.home__feed-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

@media (max-width: 1080px) {
  .home__intro {
    grid-template-columns: minmax(0, 1fr) 290px;
  }

  .home__body {
    grid-template-columns: minmax(260px, 27fr) minmax(0, 73fr);
    gap: 24px;
  }
}

@media (max-width: 860px) {
  .home__intro,
  .home__body {
    grid-template-columns: 1fr;
  }

  .home__intro {
    height: auto;
  }

  .home__rail {
    position: static;
  }
}

@media (max-width: 640px) {
  .home {
    padding-block: 22px 52px;
  }

  .home__intro {
    gap: 14px;
    margin-bottom: 24px;
  }

  .home__feed-head {
    align-items: flex-start;
    gap: 14px;
  }
}
</style>
