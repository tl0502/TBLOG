<script setup lang="ts">
import type { HomeRailCardSize } from '~/types/settings'

withDefaults(defineProps<{
  title: string
  size?: HomeRailCardSize
}>(), { size: 'normal' })
</script>

<template>
  <section class="sidebar-card" :class="`sidebar-card--${size}`">
    <h2 class="sidebar-card__title">{{ title }}</h2>
    <slot />
  </section>
</template>

<style scoped>
.sidebar-card {
  width: 100%;
  height: auto;
}

.sidebar-card--compact {
  padding: 14px;
}

.sidebar-card--large {
  padding: 24px;
}
</style>
