<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import SidebarCard from '~/components/home/SidebarCard.vue'
import type { HomeRailCardSize, HomeSeriesChapter, HomeSeriesStatus } from '~/types/settings'
import { isSafeRootRelativeUrl } from '~/utils/public-url'

const props = defineProps<{
  title: string
  size: HomeRailCardSize
  seriesTitle: string
  status: HomeSeriesStatus
  chapters: HomeSeriesChapter[]
  showProgress: boolean
  storageEnabled?: boolean
}>()
const visited = ref<string[]>([])
const key = computed(() => `tblog:series:${props.seriesTitle}`)
const progress = computed(() => props.chapters.length ? Math.round(visited.value.filter((url) => props.chapters.some((chapter) => chapter.url === url)).length / props.chapters.length * 100) : 0)
const internal = isSafeRootRelativeUrl

onMounted(() => {
  if (!props.showProgress || props.storageEnabled === false) return
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key.value) ?? '[]')
    visited.value = Array.isArray(stored)
      ? stored.filter((value): value is string => typeof value === 'string').slice(0, 100)
      : []
  } catch { visited.value = [] }
})

function mark(url: string) {
  if (!props.showProgress || props.storageEnabled === false) return
  if (!visited.value.includes(url)) visited.value = [...visited.value, url]
  try { localStorage.setItem(key.value, JSON.stringify(visited.value)) } catch { /* storage is optional */ }
}
</script>

<template>
  <SidebarCard class="reading-series-card" :title="title" :size="size">
    <template v-if="seriesTitle && chapters.length">
      <header><h3>{{ seriesTitle }}</h3><span>{{ status === 'complete' ? '已完结' : '连载中' }}</span></header>
      <div class="reading-series-card__chapters">
        <template v-for="(chapter, index) in chapters" :key="`${chapter.url}-${index}`">
          <NuxtLink v-if="internal(chapter.url)" :to="chapter.url" class="reading-series-card__chapter" @click="mark(chapter.url)"><i :class="{ done: visited.includes(chapter.url) }">{{ visited.includes(chapter.url) ? '✓' : String(index + 1).padStart(2, '0') }}</i><span>{{ chapter.title }}</span></NuxtLink>
          <a v-else :href="chapter.url" class="reading-series-card__chapter" target="_blank" rel="noopener noreferrer" @click="mark(chapter.url)"><i :class="{ done: visited.includes(chapter.url) }">{{ visited.includes(chapter.url) ? '✓' : String(index + 1).padStart(2, '0') }}</i><span>{{ chapter.title }}</span></a>
        </template>
      </div>
      <div v-if="showProgress" class="reading-series-card__progress"><i :style="{ width: `${progress}%` }" /></div>
      <small v-if="showProgress">本地阅读进度 {{ progress }}%</small>
    </template>
    <p v-else>尚未发布可展示的系列。</p>
  </SidebarCard>
</template>

<style scoped>
.reading-series-card header{display:flex;justify-content:space-between;gap:8px}.reading-series-card h3{margin:0;font-family:var(--font-display);font-size:1rem}.reading-series-card header span{height:max-content;padding:4px 7px;border-radius:999px;color:var(--color-accent);background:rgba(var(--color-accent-rgb),.1);font-size:.6rem;font-weight:850}.reading-series-card__chapters{display:grid;gap:9px;margin-top:14px}.reading-series-card__chapter{display:grid;grid-template-columns:23px 1fr;gap:7px;align-items:center;color:var(--color-muted);font-size:.7rem;line-height:1.4;text-decoration:none}.reading-series-card__chapter i{display:grid;width:20px;height:20px;border:1px solid var(--color-line);border-radius:50%;font-style:normal;font-size:.55rem;place-items:center}.reading-series-card__chapter i.done{border-color:var(--color-accent);color:#fff;background:var(--color-accent)}.reading-series-card__chapter:hover span{color:var(--color-text)}.reading-series-card__progress{height:4px;margin-top:14px;border-radius:5px;background:rgba(var(--color-accent-rgb),.12);overflow:hidden}.reading-series-card__progress i{display:block;height:100%;background:var(--color-accent)}.reading-series-card small,.reading-series-card p{display:block;margin-top:7px;color:var(--color-muted);font-size:.62rem}.reading-series-card p{margin:0}
</style>
