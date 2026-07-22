<script setup lang="ts">
import SidebarCard from '~/components/home/SidebarCard.vue'
import type { HomeRailSiteHistoryView } from '~/types/public-view'
import type { HomeRailCardSize } from '~/types/settings'
import { formatPublishedDate } from '~/utils/format-date'

defineProps<{ title: string; size: HomeRailCardSize; data: HomeRailSiteHistoryView | null }>()
</script>

<template>
  <SidebarCard class="site-history-card" :title="title" :size="size">
    <template v-if="data && (data.daysRunning !== null || data.lastUpdatedAt)">
      <template v-if="data.daysRunning !== null">
        <div class="site-history-card__days">{{ data.daysRunning }} <small>天</small></div>
        <p v-if="data.startDate">自 {{ formatPublishedDate(data.startDate) }} 持续记录</p>
      </template>
      <div v-if="data.lastUpdatedAt" class="site-history-card__updated"><span>最近更新</span><time :datetime="data.lastUpdatedAt">{{ formatPublishedDate(data.lastUpdatedAt) }}</time></div>
    </template>
    <p v-else class="site-history-card__empty">设置建站日期后显示历程。</p>
  </SidebarCard>
</template>

<style scoped>
.site-history-card__days{font-family:var(--font-display);font-size:2.35rem;line-height:1}.site-history-card__days small{font-family:var(--font-sans);font-size:.72rem}.site-history-card p{margin:7px 0 14px;color:var(--color-muted);font-size:.72rem}.site-history-card__updated{display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid var(--color-line);color:var(--color-muted);font-size:.68rem}.site-history-card__updated time{color:var(--color-text);font-weight:700}.site-history-card__empty{margin:0!important}
</style>
