<script setup lang="ts">
import type { HotspotsView } from '~/types/public-view'
import { useTblogI18n } from '~/composables/useTblogI18n'

defineProps<{ hotspots: HotspotsView }>()
const { t, formatNumber } = useTblogI18n()
</script>

<template>
  <aside class="hotspot-stats-card">
    <header class="hotspot-stats-card__head">
      <div class="hotspot-stats-card__eyebrow">{{ t('home.hotspotsEyebrow') }}</div>
      <span v-if="hotspots.current.some((item) => item.trend === 'up')" class="hotspot-stats-card__live">
        {{ t('home.hotspotsRising') }}
      </span>
    </header>

    <section v-if="hotspots.current.length" class="hotspot-stats-card__current">
      <div class="hotspot-stats-card__section-head"><b>{{ t('home.currentHotspots') }}</b><span>Trending</span></div>
      <NuxtLink class="hotspot-stats-card__lead" :to="`/posts/${hotspots.current[0].article.slug}`">
        <span>{{ t('home.hotspotRank', { rank: '1' }) }}</span>
        <strong>{{ hotspots.current[0].article.title }}</strong>
        <small v-if="hotspots.current[0].pageViews !== null">
          {{ t('home.pageViews', { count: formatNumber(hotspots.current[0].pageViews) }) }}
        </small>
      </NuxtLink>
      <div class="hotspot-stats-card__tiles">
        <NuxtLink v-for="(item, index) in hotspots.current.slice(1, 3)" :key="item.article.id" class="hotspot-stats-card__tile" :to="`/posts/${item.article.slug}`">
          <b>{{ t('home.hotspotRank', { rank: String(index + 2) }) }}</b>
          <span>{{ item.article.title }}</span>
          <small v-if="item.pageViews !== null">{{ t('home.pageViews', { count: formatNumber(item.pageViews) }) }}</small>
        </NuxtLink>
      </div>
    </section>

    <section v-if="hotspots.historical.length" class="hotspot-stats-card__history">
      <div class="hotspot-stats-card__section-head"><span>{{ t('home.historicalHotspots') }}</span><span>{{ t('home.retainedPeriod') }}</span></div>
      <div class="hotspot-stats-card__history-list">
        <NuxtLink v-for="(item, index) in hotspots.historical.slice(0, 10)" :key="item.article.id" class="hotspot-stats-card__row" :to="`/posts/${item.article.slug}`">
          <b>{{ String(index + 1).padStart(2, '0') }}</b>
          <span :title="item.article.title">{{ item.article.title }}</span>
          <small v-if="item.pageViews !== null">{{ formatNumber(item.pageViews) }}</small>
        </NuxtLink>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.hotspot-stats-card {
  display: flex;
  min-width: 0;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  padding: 16px 18px;
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-panel);
  box-shadow: var(--shadow-card);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.hotspot-stats-card:hover {
  border-color: rgba(var(--color-accent-rgb), 0.42);
  box-shadow: 0 22px 52px rgba(var(--color-text-rgb), 0.12);
  transform: translateY(-4px);
}

.hotspot-stats-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.hotspot-stats-card__eyebrow {
  color: var(--color-accent);
  font-size: 0.62rem;
  font-weight: 850;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.hotspot-stats-card__live {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-accent-warm);
  font-size: 0.6rem;
  font-weight: 800;
  white-space: nowrap;
}

.hotspot-stats-card__live::before {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 4px rgba(var(--color-accent-warm-rgb), 0.1);
  content: '';
}

.hotspot-stats-card__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
  color: var(--color-muted);
  font-size: 0.6rem;
  font-weight: 850;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.hotspot-stats-card__section-head b {
  color: var(--color-accent-warm);
}

.hotspot-stats-card__lead {
  display: block;
  margin-bottom: 6px;
  padding: 10px 11px;
  border-radius: 10px;
  color: var(--color-text);
  text-decoration: none;
  background: linear-gradient(135deg, rgba(var(--color-accent-rgb), 0.15), rgba(var(--color-accent-warm-rgb), 0.08));
  transition: transform 0.16s ease;
}

.hotspot-stats-card__lead:hover {
  transform: translateY(-2px);
}

.hotspot-stats-card__lead > span {
  color: var(--color-accent-warm);
  font-size: 0.61rem;
  font-weight: 850;
}

.hotspot-stats-card__lead strong {
  display: -webkit-box;
  margin: 3px 0;
  overflow: hidden;
  font-family: var(--font-display);
  font-size: 0.86rem;
  line-height: 1.34;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.hotspot-stats-card__lead small {
  color: var(--color-muted);
  font-size: 0.58rem;
}

.hotspot-stats-card__tile small {
  color: var(--color-muted);
  font-size: 0.58rem;
}

.hotspot-stats-card__tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  margin-bottom: 8px;
}

.hotspot-stats-card__tile {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 8px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  color: var(--color-text);
  text-decoration: none;
}

.hotspot-stats-card__tile:hover {
  border-color: rgba(var(--color-accent-rgb), 0.45);
}

.hotspot-stats-card__tile b {
  color: var(--color-accent-warm);
  font-size: 0.56rem;
  white-space: nowrap;
}

.hotspot-stats-card__tile span {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 3px;
  font-size: 0.64rem;
  font-weight: 730;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.hotspot-stats-card__tile small {
  margin-top: auto;
  padding-top: 4px;
}

.hotspot-stats-card__history {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.hotspot-stats-card__history-list {
  display: flex;
  max-height: 102px;
  min-height: 0;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.hotspot-stats-card__history-list::-webkit-scrollbar {
  display: none;
}

.hotspot-stats-card__row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 42px;
  min-width: 0;
  height: 34px;
  min-height: 34px;
  flex: 0 0 34px;
  gap: 6px;
  align-items: center;
  padding: 6px 0;
  border-top: 1px solid var(--color-line);
  color: var(--color-text);
  text-decoration: none;
}

.hotspot-stats-card__row > b {
  color: var(--color-accent-warm);
  font-family: var(--font-display);
  font-size: 0.82rem;
}

.hotspot-stats-card__row > span {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  font-size: 0.69rem;
  font-weight: 740;
  line-height: 1.32;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hotspot-stats-card__row > small {
  width: 42px;
  min-width: 0;
  overflow: hidden;
  color: var(--color-muted);
  font-size: 0.57rem;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  text-align: right;
  white-space: nowrap;
}

.hotspot-stats-card__row:hover > span {
  color: var(--color-accent);
}

@media (max-width: 860px) {
  .hotspot-stats-card {
    height: auto;
    min-height: 0;
  }
}
</style>
