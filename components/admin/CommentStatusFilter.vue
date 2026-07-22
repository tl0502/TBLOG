<script setup lang="ts">
import { computed } from 'vue'
import type { AdminCommentStatus } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

export type CommentStatusFilterValue = AdminCommentStatus | 'all'

interface Props {
  status: CommentStatusFilterValue
  disabled?: boolean
}

withDefaults(defineProps<Props>(), { disabled: false })
const emit = defineEmits<{ change: [status: CommentStatusFilterValue] }>()
const { t } = useTblogI18n()

const options = computed<ReadonlyArray<{ value: CommentStatusFilterValue; label: string }>>(() => [
  { value: 'pending', label: t('moderation.pending') }, { value: 'approved', label: t('moderation.approved') },
  { value: 'rejected', label: t('moderation.rejected') }, { value: 'all', label: t('moderation.all') }
])
</script>

<template>
  <div class="comment-filter" role="group" :aria-label="t('moderation.filterLabel')">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="comment-filter__option"
      :class="{ 'comment-filter__option--active': option.value === status }"
      :aria-pressed="option.value === status"
      :data-test="`comment-filter-${option.value}`"
      :disabled="disabled"
      @click="emit('change', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.comment-filter {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  background: var(--color-panel);
}

.comment-filter__option {
  min-height: 32px;
  padding: 5px 11px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.comment-filter__option--active {
  background: var(--admin-hover);
  color: var(--color-accent);
}

.comment-filter__option:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
</style>
