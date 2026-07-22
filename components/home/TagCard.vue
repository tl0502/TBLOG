<script setup lang="ts">
import { computed, ref } from 'vue'
import SidebarCard from '~/components/home/SidebarCard.vue'
import type { TagView } from '~/types/public-view'
import type { HomeRailCardSize } from '~/types/settings'

interface Props {
  tags: TagView[]
  collapsedCount?: number
  title?: string
  size?: HomeRailCardSize
}

const props = withDefaults(defineProps<Props>(), { collapsedCount: 12, title: 'Tags', size: 'normal' })

const expanded = ref(false)
const canToggle = computed(() => props.tags.length > props.collapsedCount)
const visibleTags = computed(() =>
  expanded.value || !canToggle.value ? props.tags : props.tags.slice(0, props.collapsedCount)
)

function toggle() {
  expanded.value = !expanded.value
}
</script>

<template>
  <SidebarCard class="tag-card" :title="props.title" :size="props.size">
    <ul class="tag-card__list">
      <li v-for="tag in visibleTags" :key="tag.slug">
        <NuxtLink class="tag-card__tag" :to="`/tags/${tag.slug}`">{{ tag.name }}</NuxtLink>
      </li>
    </ul>

    <button v-if="canToggle" class="tag-card__toggle" type="button" @click="toggle">
      {{ expanded ? 'Show less' : `Show all (${tags.length})` }}
    </button>
  </SidebarCard>
</template>

<style scoped>
.tag-card__list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tag-card__tag {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--color-line);
  background: var(--color-page);
  color: var(--color-muted);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: none;
}

.tag-card__tag:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.tag-card__toggle {
  margin-top: 14px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-muted);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.tag-card__toggle:hover {
  color: var(--color-accent);
}
</style>
