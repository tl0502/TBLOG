<script setup lang="ts">
import SidebarCard from '~/components/home/SidebarCard.vue'
import type { HomeRailActivityEntryView } from '~/types/public-view'
import type { HomeRailCardSize } from '~/types/settings'
import { formatPublishedDate } from '~/utils/format-date'
import { isSafeRootRelativeUrl } from '~/utils/public-url'

defineProps<{ title: string; size: HomeRailCardSize; entries: HomeRailActivityEntryView[] }>()
const internal = (url: string | null) => Boolean(url && isSafeRootRelativeUrl(url))
</script>

<template>
  <SidebarCard class="site-activity-card" :title="title" :size="size">
    <div v-if="entries.length" class="site-activity-card__timeline">
      <article v-for="entry in entries" :key="`${entry.date}-${entry.title}`" class="site-activity-card__event">
        <time :datetime="entry.date">{{ formatPublishedDate(entry.date) }}</time>
        <NuxtLink v-if="entry.url && internal(entry.url)" :to="entry.url"><b>{{ entry.title }}</b></NuxtLink>
        <a v-else-if="entry.url" :href="entry.url" target="_blank" rel="noopener noreferrer"><b>{{ entry.title }}</b></a>
        <b v-else>{{ entry.title }}</b>
        <span>{{ entry.detail }}</span>
      </article>
    </div>
    <p v-else>最近没有新的公开动态。</p>
  </SidebarCard>
</template>

<style scoped>
.site-activity-card__event{position:relative;padding:0 0 14px 17px;border-left:1px solid var(--color-line)}.site-activity-card__event:last-child{padding-bottom:0}.site-activity-card__event:before{position:absolute;top:3px;left:-4px;width:7px;height:7px;border:2px solid var(--color-panel);border-radius:50%;background:var(--color-accent-warm);content:""}.site-activity-card time,.site-activity-card span{display:block;color:var(--color-muted);font-size:.61rem}.site-activity-card b{display:block;margin:3px 0;color:var(--color-text);font-size:.72rem;line-height:1.4}.site-activity-card a{text-decoration:none}.site-activity-card a:hover b{color:var(--color-accent)}.site-activity-card p{margin:0;color:var(--color-muted);font-size:.72rem}
</style>
