<script setup lang="ts">
import SidebarCard from '~/components/home/SidebarCard.vue'
import type { HomeRailCardSize } from '~/types/settings'
import { isSafeRootRelativeUrl } from '~/utils/public-url'

const props = defineProps<{
  title: string
  size: HomeRailCardSize
  eyebrow: string
  topicTitle: string
  summary: string
  coverUrl: string | null
  targetUrl: string
  articleCount: number | null
}>()
const internal = isSafeRootRelativeUrl(props.targetUrl)
</script>

<template>
  <SidebarCard class="curated-topic-card" :title="title" :size="size">
    <div v-if="topicTitle" class="curated-topic-card__content">
      <div v-if="coverUrl" class="curated-topic-card__cover" :style="{ backgroundImage: `linear-gradient(145deg,rgba(39,52,61,.76),rgba(128,85,62,.58)),url(${coverUrl})` }" />
      <small>{{ eyebrow }}<template v-if="articleCount !== null"> · {{ articleCount }} 篇</template></small>
      <h3>{{ topicTitle }}</h3><p>{{ summary }}</p>
      <NuxtLink v-if="targetUrl && internal" class="curated-topic-card__action" :to="targetUrl">进入专题 →</NuxtLink>
      <a v-else-if="targetUrl" class="curated-topic-card__action" :href="targetUrl" target="_blank" rel="noopener noreferrer">进入专题 ↗</a>
    </div>
    <p v-else class="curated-topic-card__empty">当前没有开放的策展专题。</p>
  </SidebarCard>
</template>

<style scoped>
.curated-topic-card__cover{height:84px;margin:-4px -4px 13px;border-radius:11px;background-position:center;background-size:cover}.curated-topic-card small{color:var(--color-accent-warm);font-size:.62rem;font-weight:850;letter-spacing:.07em}.curated-topic-card h3{margin:5px 0 7px;font-family:var(--font-display);font-size:1.05rem;line-height:1.28}.curated-topic-card p{margin:0;color:var(--color-muted);font-size:.72rem;line-height:1.55}.curated-topic-card__action{display:inline-block;margin-top:11px;color:var(--color-accent);font-size:.72rem;font-weight:850;text-decoration:none}.curated-topic-card__empty{margin:0!important}
</style>
