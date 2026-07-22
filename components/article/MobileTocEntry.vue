<script setup lang="ts">
import { ref } from 'vue'
import type { TocItemView } from '~/types/public-view'
import ArticleToc from '~/components/article/ArticleToc.vue'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  toc: TocItemView[]
}

defineProps<Props>()

const open = ref(false)
const { t } = useTblogI18n()

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}
</script>

<template>
  <div class="mobile-toc">
    <button
      type="button"
      class="mobile-toc__button"
      :aria-expanded="open"
      aria-controls="mobile-toc-drawer"
      @click="toggle"
    >
      {{ t('article.toc') }}
    </button>

    <div v-if="open" id="mobile-toc-drawer" class="mobile-toc__drawer">
      <ArticleToc :items="toc" @navigate="close" />
    </div>
  </div>
</template>

<style scoped>
.mobile-toc {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-panel);
  box-shadow: var(--shadow-card);
}

.mobile-toc__button {
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 0.92rem;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
}

.mobile-toc__drawer {
  padding: 0 16px 14px;
}
</style>
