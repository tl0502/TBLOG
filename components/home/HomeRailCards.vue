<script setup lang="ts">
import { computed } from 'vue'
import { homeRailCardRegistry } from '~/components/home/home-rail-card-registry'
import type { HomeRailDataView, TagView } from '~/types/public-view'
import type { PublicHomeRailCard } from '~/types/settings'

const props = defineProps<{ cards: PublicHomeRailCard[]; tags: TagView[]; data?: HomeRailDataView | null; preview?: boolean }>()

const resolvedCards = computed(() => props.cards
  .map((card) => ({
    key: card.instanceId,
    component: homeRailCardRegistry[card.type].component,
    props: homeRailCardRegistry[card.type].props(card, { tags: props.tags, data: props.data ?? null, preview: props.preview ?? false })
  })))
</script>

<template>
  <Component
    :is="card.component"
    v-for="card in resolvedCards"
    :key="card.key"
    v-bind="card.props"
  />
</template>
