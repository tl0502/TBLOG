<script setup lang="ts">
import { computed } from 'vue'
import SidebarCard from '~/components/home/SidebarCard.vue'
import type { HomeRailContentStatsView } from '~/types/public-view'
import type { HomeContentMetric, HomeRailCardSize } from '~/types/settings'
import { useTblogI18n } from '~/composables/useTblogI18n'

const props = defineProps<{
  title: string
  size: HomeRailCardSize
  metrics: HomeContentMetric[]
  data: HomeRailContentStatsView | null
}>()
const { formatNumber } = useTblogI18n()
const labels: Record<HomeContentMetric, string> = {
  articles: '公开文章', categories: '内容分类', tags: '主题标签', pageViews: '文章浏览'
}
const items = computed(() => props.metrics.flatMap((metric) => {
  const value = props.data?.[metric]
  return typeof value === 'number' ? [{ metric, value, label: labels[metric] }] : []
}))
</script>

<template>
  <SidebarCard class="content-stats-card" :title="title" :size="size">
    <div v-if="items.length" class="content-stats-card__grid">
      <div v-for="item in items" :key="item.metric" class="content-stats-card__metric">
        <b>{{ formatNumber(item.value) }}</b><span>{{ item.label }}</span>
      </div>
    </div>
    <p v-else class="content-stats-card__empty">公开统计暂不可用。</p>
  </SidebarCard>
</template>

<style scoped>
.content-stats-card__grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.content-stats-card__metric{padding:10px;border:1px solid var(--color-line);border-radius:11px;background:rgba(var(--color-panel-rgb),.42)}.content-stats-card__metric b{display:block;font-family:var(--font-display);font-size:1.25rem}.content-stats-card__metric span,.content-stats-card__empty{color:var(--color-muted);font-size:.69rem}.content-stats-card__empty{margin:0}
</style>
