<script setup lang="ts">
import { computed } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  total: number
  offset: number
  limit: number
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), { disabled: false })
const emit = defineEmits<{ prev: []; next: [] }>()
const { t } = useTblogI18n()

const hasPrevious = computed(() => props.offset > 0)
const hasNext = computed(() => props.offset + props.limit < props.total)
const rangeStart = computed(() => props.total === 0 ? 0 : Math.min(props.offset + 1, props.total))
const rangeEnd = computed(() => Math.min(props.offset + props.limit, props.total))
</script>

<template>
  <div class="comment-pagination" :aria-label="t('moderation.pages')">
    <p class="comment-pagination__range">{{ t('moderation.range', { start: rangeStart, end: rangeEnd, total }) }}</p>
    <div class="comment-pagination__actions">
      <button
        type="button"
        class="comment-pagination__button"
        data-test="comment-page-prev"
        :disabled="disabled || !hasPrevious"
        @click="emit('prev')"
      >
        {{ t('moderation.previous') }}
      </button>
      <button
        type="button"
        class="comment-pagination__button"
        data-test="comment-page-next"
        :disabled="disabled || !hasNext"
        @click="emit('next')"
      >
        {{ t('moderation.next') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.comment-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 12px;
}

.comment-pagination__range {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.comment-pagination__actions {
  display: flex;
  gap: 7px;
}

.comment-pagination__button {
  min-height: 34px;
  padding: 6px 11px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: var(--color-page);
  color: var(--color-text);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.comment-pagination__button:disabled {
  opacity: 0.45;
  cursor: default;
}

.comment-pagination__button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
</style>
