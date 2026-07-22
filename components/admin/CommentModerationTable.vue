<script setup lang="ts">
import { computed } from 'vue'
import type { AdminCommentView } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  rows: AdminCommentView[]
  pendingIds?: string[]
  selectedIds?: string[]
  batchPending?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  pendingIds: () => [],
  selectedIds: () => [],
  batchPending: false
})
const emit = defineEmits<{
  approve: [id: string]
  reject: [id: string]
  autoModerate: [id: string]
  delete: [id: string]
  toggleSelection: [id: string, selected: boolean]
  togglePage: [selected: boolean]
}>()
const { formatDate: formatLocaleDate, t } = useTblogI18n()
const selectedSet = computed(() => new Set(props.selectedIds))
const pendingSet = computed(() => new Set(props.pendingIds))
const allSelected = computed(() => props.rows.length > 0 && props.rows.every((row) => selectedSet.value.has(row.id)))
const someSelected = computed(() => props.rows.some((row) => selectedSet.value.has(row.id)) && !allSelected.value)
const pageSelectionDisabled = computed(() => props.batchPending || props.pendingIds.length > 0)

function rowDisabled(id: string) {
  return props.batchPending || pendingSet.value.has(id)
}

function checked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}

function formatDate(value: string | null): string {
  if (!value) {
    return t('moderation.notReviewed')
  }
  return formatLocaleDate(value, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })
}

function statusLabel(status: AdminCommentView['status']) {
  const keys = {
    pending: 'moderation.pending', approved: 'moderation.approved', rejected: 'moderation.rejected'
  } as const
  return t(keys[status])
}
</script>

<template>
  <div class="comment-ledger">
    <p v-if="rows.length === 0" class="comment-ledger__empty">{{ t('moderation.empty') }}</p>
    <table v-else class="comment-ledger__table">
      <thead>
        <tr>
          <th class="comment-ledger__select" scope="col">
            <input
              type="checkbox"
              data-test="comment-select-page"
              :checked="allSelected"
              :indeterminate="someSelected"
              :aria-checked="someSelected ? 'mixed' : allSelected"
              :aria-label="t('moderation.selectPage')"
              :disabled="pageSelectionDisabled"
              @change="emit('togglePage', checked($event))"
            >
          </th>
          <th scope="col">{{ t('comments.comment') }}</th><th scope="col">{{ t('moderation.article') }}</th>
          <th scope="col">{{ t('table.status') }}</th><th scope="col">{{ t('moderation.dates') }}</th>
          <th scope="col"><span class="comment-ledger__visually-hidden">{{ t('table.actions') }}</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.id"
          class="comment-ledger__row"
          :class="`comment-ledger__row--${row.status}`"
        >
          <td class="comment-ledger__select">
            <input
              type="checkbox"
              :data-test="`comment-select-${row.id}`"
              :checked="selectedSet.has(row.id)"
              :aria-label="t('moderation.selectComment', { nickname: row.nickname })"
              :disabled="rowDisabled(row.id)"
              @change="emit('toggleSelection', row.id, checked($event))"
            >
          </td>
          <td class="comment-ledger__comment">
            <span class="comment-ledger__rail" aria-hidden="true" />
            <div class="comment-ledger__identity">
              <strong>{{ row.nickname }}</strong>
              <span v-if="row.parentCommentId" class="comment-ledger__reply-badge">{{ t('moderation.reply') }}</span>
              <a v-if="row.email" class="comment-ledger__email" :href="`mailto:${row.email}`">
                {{ row.email }}
              </a>
              <span v-else class="comment-ledger__email">{{ t('moderation.noEmail') }}</span>
            </div>
            <p
              class="comment-ledger__content"
              :data-test="`comment-content-${row.id}`"
            >{{ row.content }}</p>
            <blockquote v-if="row.parent" class="comment-ledger__parent-context">
              <strong>{{ row.parent.nickname }}</strong>
              <span>{{ row.parent.content }}</span>
            </blockquote>
          </td>
          <td>
            <NuxtLink
              class="comment-ledger__article"
              :to="`/posts/${row.post.slug}`"
              :data-test="`comment-article-${row.id}`"
            >
              {{ row.post.title }}
            </NuxtLink>
          </td>
          <td>
            <span class="comment-ledger__status" :class="`comment-ledger__status--${row.status}`">
              {{ statusLabel(row.status) }}
            </span>
          </td>
          <td class="comment-ledger__dates">
            <span>{{ t('moderation.submitted', { date: formatDate(row.createdAt) }) }}</span>
            <span>{{ row.reviewedAt ? t('moderation.reviewed', { date: formatDate(row.reviewedAt) }) : t('moderation.notReviewed') }}</span>
          </td>
          <td>
            <div class="comment-ledger__actions">
              <button
                type="button"
                class="comment-ledger__action comment-ledger__action--automatic"
                :data-test="`comment-auto-moderate-${row.id}`"
                :disabled="rowDisabled(row.id)"
                @click="emit('autoModerate', row.id)"
              >{{ pendingSet.has(row.id) ? t('moderation.autoModerating') : t('moderation.autoModerate') }}</button>
              <button
                v-if="row.status !== 'approved'"
                type="button"
                class="comment-ledger__action comment-ledger__action--approve"
                :data-test="`comment-approve-${row.id}`"
                :disabled="rowDisabled(row.id)"
                @click="emit('approve', row.id)"
              >{{ pendingSet.has(row.id) ? t('comments.submitting') : t('moderation.approve') }}</button>
              <button
                v-if="row.status !== 'rejected'"
                type="button"
                class="comment-ledger__action"
                :data-test="`comment-reject-${row.id}`"
                :disabled="rowDisabled(row.id)"
                @click="emit('reject', row.id)"
              >{{ pendingSet.has(row.id) ? t('comments.submitting') : t('moderation.reject') }}</button>
              <button
                type="button"
                class="comment-ledger__action comment-ledger__action--delete"
                :data-test="`comment-delete-${row.id}`"
                :disabled="rowDisabled(row.id)"
                @click="emit('delete', row.id)"
              >{{ pendingSet.has(row.id) ? t('comments.submitting') : t('common.delete') }}</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.comment-ledger {
  overflow-x: auto;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-panel);
  box-shadow: var(--shadow-card);
}

.comment-ledger__table {
  width: 100%;
  min-width: 960px;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.comment-ledger__table th,
.comment-ledger__table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-line);
  text-align: left;
  vertical-align: top;
}

.comment-ledger__table th {
  color: var(--color-muted);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.comment-ledger__row:last-child td {
  border-bottom: 0;
}

.comment-ledger__comment {
  position: relative;
  width: 38%;
  padding-inline-start: 18px !important;
}

.comment-ledger__rail {
  position: absolute;
  inset-block: 9px;
  inset-inline-start: 6px;
  width: 3px;
  border-radius: 999px;
  background: var(--color-accent);
}

.comment-ledger__row--approved .comment-ledger__rail {
  background: var(--color-muted);
}

.comment-ledger__row--rejected .comment-ledger__rail {
  background: var(--color-accent-warm);
}

.comment-ledger__identity {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 5px 9px;
  color: var(--color-text);
}

.comment-ledger__email,
.comment-ledger__dates {
  color: var(--color-muted);
  font-size: 0.75rem;
}

.comment-ledger__content {
  margin: 6px 0 0;
  color: var(--color-text);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.comment-ledger__article {
  color: var(--color-text);
  font-weight: 700;
  text-decoration-color: var(--color-line);
}

.comment-ledger__status {
  display: inline-flex;
  padding: 2px 7px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  border-color: rgba(var(--admin-info-rgb), 0.24);
  color: var(--admin-info);
  background: rgba(var(--admin-info-rgb), 0.12);
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
}

.comment-ledger__status--approved {
  border-color: rgba(var(--admin-success-rgb), 0.24);
  color: var(--admin-success);
  background: rgba(var(--admin-success-rgb), 0.12);
}

.comment-ledger__reply-badge { padding: 2px 6px; border-radius: 999px; background: rgba(var(--color-accent-warm-rgb), .09); color: var(--color-accent-warm); font-size: .65rem; font-weight: 800; }
.comment-ledger__parent-context { display: grid; gap: 3px; margin: 9px 0 0; padding: 8px 10px; border: 0; border-inline-start: 2px solid rgba(var(--color-accent-rgb), .28); color: var(--color-muted); font-size: .72rem; }
.comment-ledger__parent-context strong { color: var(--color-text); }
.comment-ledger__parent-context span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.comment-ledger__select {
  width: 34px;
  text-align: center !important;
}

.comment-ledger__status--rejected {
  border-color: rgba(var(--color-accent-warm-rgb), 0.25);
  color: var(--color-accent-warm);
  background: var(--admin-warm-subtle);
}

.comment-ledger__dates {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 150px;
  font-variant-numeric: tabular-nums;
}

.comment-ledger__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 5px;
}

.comment-ledger__action {
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid var(--color-line);
  border-radius: 7px;
  background: var(--color-page);
  color: var(--color-text);
  font: inherit;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
}

.comment-ledger__action--approve {
  color: var(--color-accent);
}

.comment-ledger__action--automatic {
  color: var(--admin-info);
}

.comment-ledger__action--delete {
  color: var(--color-accent-warm);
}

.comment-ledger__action:disabled {
  opacity: 0.5;
  cursor: default;
}

.comment-ledger__action:focus-visible,
.comment-ledger__article:focus-visible,
.comment-ledger__email:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

.comment-ledger__empty {
  margin: 0;
  padding: 28px 18px;
  color: var(--color-muted);
  text-align: center;
}

.comment-ledger__visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
