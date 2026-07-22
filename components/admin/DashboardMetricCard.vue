<script setup lang="ts">
interface Props {
  label: string
  value: number
}

defineProps<Props>()
</script>

<template>
  <div class="metric-card">
    <span class="metric-card__value">{{ value }}</span>
    <span class="metric-card__label">{{ label }}</span>
  </div>
</template>
