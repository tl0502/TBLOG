<script setup lang="ts">
import { computed } from 'vue'
import SidebarCard from '~/components/home/SidebarCard.vue'
import type { HomeRailRhythmPointView } from '~/types/public-view'
import type { HomeRailCardSize } from '~/types/settings'

const props = defineProps<{ title: string; size: HomeRailCardSize; points: HomeRailRhythmPointView[] }>()
const max = computed(() => Math.max(1, ...props.points.map((point) => point.count)))
const total = computed(() => props.points.reduce((sum, point) => sum + point.count, 0))
</script>

<template>
  <SidebarCard class="publishing-rhythm-card" :title="title" :size="size">
    <template v-if="points.length">
      <div class="publishing-rhythm-card__summary"><b>{{ total }}</b><span>区间内公开变化</span></div>
      <div class="publishing-rhythm-card__bars" aria-label="每周发布节奏">
        <i v-for="point in points" :key="point.weekStart" :style="{ height: `${Math.max(12, point.count / max * 100)}%` }" :title="`${point.weekStart}: ${point.count}`" />
      </div>
      <div class="publishing-rhythm-card__range"><span>{{ points[0]?.weekStart }}</span><span>{{ points.at(-1)?.weekStart }}</span></div>
    </template>
    <p v-else>近期暂无公开发布记录。</p>
  </SidebarCard>
</template>

<style scoped>
.publishing-rhythm-card__summary{display:flex;align-items:end;justify-content:space-between;color:var(--color-muted);font-size:.67rem}.publishing-rhythm-card__summary b{color:var(--color-text);font-family:var(--font-display);font-size:1.65rem}.publishing-rhythm-card__bars{display:flex;height:58px;align-items:end;gap:5px;margin-top:10px}.publishing-rhythm-card__bars i{flex:1;min-height:6px;border-radius:4px 4px 2px 2px;background:linear-gradient(var(--color-accent),rgba(var(--color-accent-rgb),.35))}.publishing-rhythm-card__range{display:flex;justify-content:space-between;margin-top:7px;color:var(--color-muted);font-size:.59rem}.publishing-rhythm-card p{margin:0;color:var(--color-muted);font-size:.72rem}
</style>
