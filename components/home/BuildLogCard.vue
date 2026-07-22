<script setup lang="ts">
import SidebarCard from '~/components/home/SidebarCard.vue'
import type { HomeRailCardSize } from '~/types/settings'

interface BuildLogEntry {
  label: string
}

interface Props {
  entries?: BuildLogEntry[]
  title?: string
  size?: HomeRailCardSize
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Build Log',
  size: 'normal',
  entries: () => [
    { label: 'Public read APIs and cache boundaries' },
    { label: 'Public frontend foundation' }
  ]
})
</script>

<template>
  <SidebarCard class="build-log-card" :title="props.title" :size="props.size">
    <ul class="build-log-card__list">
      <li v-for="(entry, index) in props.entries" :key="`${entry.label}-${index}`" class="build-log-card__item">
        {{ entry.label }}
      </li>
    </ul>
  </SidebarCard>
</template>

<style scoped>
.build-log-card__list {
  margin: 0;
  padding-left: 18px;
  color: var(--color-muted);
  font-size: 0.88rem;
  line-height: 1.7;
}
</style>
