<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface Props {
  name: string
  src?: string | null
  size?: 'compact' | 'preview' | 'detail'
}

const props = withDefaults(defineProps<Props>(), {
  src: null,
  size: 'compact'
})

const imageFailed = ref(false)
const initial = computed(() => props.name.trim().charAt(0).toUpperCase() || 'T')

watch(() => props.src, () => { imageFailed.value = false })
</script>

<template>
  <span class="profile-avatar" :class="`profile-avatar--${props.size}`" aria-hidden="true">
    <img
      v-if="props.src && !imageFailed"
      class="profile-avatar__image"
      :src="props.src"
      alt=""
      @error="imageFailed = true"
    >
    <span v-else class="profile-avatar__initial">{{ initial }}</span>
  </span>
</template>

<style scoped>
.profile-avatar {
  position: relative;
  display: grid;
  flex: 0 0 auto;
  aspect-ratio: 1;
  overflow: hidden;
  place-items: center;
  border: 1px solid rgba(var(--color-accent-rgb), 0.35);
  color: var(--color-accent);
  font-family: var(--font-display);
  font-weight: 700;
  background: linear-gradient(145deg, rgba(var(--color-accent-rgb), 0.26), rgba(var(--color-panel-rgb), 0.82));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.36), 0 0 0 4px rgba(var(--color-accent-rgb), 0.07);
  isolation: isolate;
}

.profile-avatar::after {
  position: absolute;
  z-index: -1;
  right: -18%;
  bottom: -18%;
  width: 55%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgba(var(--color-accent-warm-rgb), 0.24);
  content: '';
}

.profile-avatar--compact {
  width: 64px;
  border-radius: 19px;
  font-size: 1.45rem;
}

.profile-avatar--preview {
  width: 72px;
  border-radius: 22px;
  font-size: 1.6rem;
}

.profile-avatar--detail {
  width: 68px;
  border-radius: 21px;
  font-size: 1.52rem;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.38),
    0 0 0 5px rgba(var(--color-accent-rgb), 0.055),
    0 12px 30px rgba(var(--color-accent-rgb), 0.1);
}

.profile-avatar__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-avatar__initial {
  line-height: 1;
}
</style>
