<script setup lang="ts">
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ toggle: [] }>()
const { t } = useTblogI18n()
</script>

<template>
  <button
    class="assist-handle"
    type="button"
    aria-controls="article-assist-rail"
    :aria-label="props.open ? t('article.closeToc') : t('article.openToc')"
    :aria-expanded="props.open"
    @click="emit('toggle')"
  >
    <span class="assist-handle__grip" aria-hidden="true"></span>
  </button>
</template>

<style scoped>
.assist-handle {
  position: fixed;
  top: 50%;
  right: 0;
  z-index: 20;
  width: 40px;
  height: 112px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.assist-handle__grip {
  position: absolute;
  top: 12px;
  right: 7px;
  bottom: 12px;
  width: 10px;
  overflow: hidden;
  border: 1px solid rgba(var(--color-accent-rgb), 0.2);
  border-radius: 999px;
  background: var(--color-panel-strong);
  box-shadow: 0 8px 22px rgba(var(--color-text-rgb), 0.08);
  color: var(--color-muted);
  opacity: 0.56;
  filter: saturate(0.35) blur(0.25px);
  transition:
    width 0.17s ease,
    opacity 0.18s ease,
    filter 0.18s ease,
    box-shadow 0.18s ease;
}

.assist-handle__grip::before {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 30px;
  background: linear-gradient(
    90deg,
    currentColor 0 1px,
    transparent 1px 3px,
    currentColor 3px 4px
  );
  content: '';
  opacity: 0.72;
  transform: translate(-50%, -50%);
}

.assist-handle:hover .assist-handle__grip,
.assist-handle:focus-visible .assist-handle__grip {
  width: 12px;
  opacity: 1;
  filter: none;
  background: rgba(var(--color-panel-rgb), 0.98);
  box-shadow: 0 10px 26px rgba(var(--color-text-rgb), 0.14);
  color: var(--color-accent);
}

.assist-handle:focus-visible {
  outline: none;
}

.assist-handle:focus-visible .assist-handle__grip {
  box-shadow: 0 0 0 3px rgba(var(--color-accent-warm-rgb), 0.2), 0 10px 26px rgba(var(--color-text-rgb), 0.14);
}
</style>
