<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import CommentModerationTable from '~/components/admin/CommentModerationTable.vue'
import CommentPagination from '~/components/admin/CommentPagination.vue'
import CommentStatusFilter, {
  type CommentStatusFilterValue
} from '~/components/admin/CommentStatusFilter.vue'
import {
  apiErrorMessage,
  autoModerateComments,
  deleteComment,
  moderateComment,
  useAdminComments,
  type AdminCommentQuery,
  type AdminCommentStatus,
  type AdminCommentView
} from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

const { t } = useTblogI18n()

const filterStatus = shallowRef<CommentStatusFilterValue>('pending')
const offset = shallowRef(0)
const limit = 20
const query = computed<AdminCommentQuery>(() => ({
  ...(filterStatus.value === 'all' ? {} : { status: filterStatus.value }),
  offset: offset.value,
  limit
}))
const { data, pending, error, refresh } = useAdminComments(query)

const rows = computed<AdminCommentView[]>(() => data.value?.data ?? [])
const total = computed(() => data.value?.meta.total ?? 0)
const readError = computed(() => error.value
  ? apiErrorMessage(error.value, t('moderation.loadError'))
  : '')

const pendingIds = ref<string[]>([])
const processingQueue = shallowRef(false)
const batchPending = shallowRef(false)
const actionError = shallowRef('')
const actionNotice = shallowRef('')
const selectedIds = ref<string[]>([])
const offsetCompensation = shallowRef(0)
const automaticModerationRequestLimit = 8
const automaticModerationSelectionLimit = 20
interface QueuedAction {
  id: string
  label: string
  action: () => Promise<unknown>
  fallback: string
}
const actionQueue: QueuedAction[] = []

watch(total, (currentTotal) => {
  const lastPageOffset = currentTotal === 0
    ? 0
    : Math.floor((currentTotal - 1) / limit) * limit

  if (offset.value > lastPageOffset) {
    offset.value = lastPageOffset
  }
})

watch([filterStatus, offset], () => {
  selectedIds.value = []
  offsetCompensation.value = 0
  actionNotice.value = ''
})

function changeFilter(status: CommentStatusFilterValue) {
  filterStatus.value = status
  offset.value = 0
}

function previousPage() {
  offset.value = Math.max(0, offset.value - limit)
}

function nextPage() {
  if (offset.value + limit < total.value) {
    offset.value += Math.max(1, limit - offsetCompensation.value)
  }
}

async function refreshMetrics() {
  await refreshNuxtData(['admin-comment-counts', 'admin-dashboard-metrics'])
}

function updateVisibleComment(id: string, status: Exclude<AdminCommentStatus, 'pending'>) {
  if (!data.value) return false
  const remainsVisible = filterStatus.value === 'all' || filterStatus.value === status
  const current = data.value.data.find((row) => row.id === id)
  if (!current) return false
  data.value = {
    ...data.value,
    data: remainsVisible
      ? data.value.data.map((row) => row.id === id
        ? { ...row, status, reviewedAt: new Date().toISOString() }
        : row)
      : data.value.data.filter((row) => row.id !== id),
    meta: {
      ...data.value.meta,
      total: remainsVisible ? data.value.meta.total : Math.max(0, data.value.meta.total - 1)
    }
  }
  if (!remainsVisible) offsetCompensation.value += 1
  return true
}

function removeVisibleComment(id: string) {
  if (!data.value || !data.value.data.some((row) => row.id === id)) return false
  data.value = {
    ...data.value,
    data: data.value.data.filter((row) => row.id !== id),
    meta: { ...data.value.meta, total: Math.max(0, data.value.meta.total - 1) }
  }
  offsetCompensation.value += 1
  return true
}

async function synchronizeAfterMutation() {
  const listSync = refresh().then(() => { offsetCompensation.value = 0 })
  await Promise.allSettled([listSync, refreshMetrics()])
}

async function processActionQueue() {
  if (processingQueue.value) return
  processingQueue.value = true
  actionError.value = ''
  actionNotice.value = ''
  const failures: string[] = []
  try {
    do {
      while (actionQueue.length > 0) {
        const queued = actionQueue.shift()
        if (!queued) continue
        try {
          await queued.action()
          selectedIds.value = selectedIds.value.filter((id) => id !== queued.id)
        } catch (caught) {
          failures.push(`${queued.label}: ${apiErrorMessage(caught, queued.fallback)}`)
        } finally {
          pendingIds.value = pendingIds.value.filter((id) => id !== queued.id)
        }
      }
      await synchronizeAfterMutation()
    } while (actionQueue.length > 0)
  } finally {
    actionError.value = failures.join(' ')
    processingQueue.value = false
  }
}

function queueAction(id: string, action: () => Promise<unknown>, fallback: string) {
  if (batchPending.value || pendingIds.value.includes(id)) return
  pendingIds.value = [...pendingIds.value, id]
  actionQueue.push({ id, label: rows.value.find((row) => row.id === id)?.nickname ?? id, action, fallback })
  void processActionQueue()
}

function toggleSelection(id: string, selected: boolean) {
  if (selected && !selectedIds.value.includes(id) && selectedIds.value.length >= automaticModerationSelectionLimit) {
    return
  }
  selectedIds.value = selected
    ? Array.from(new Set([...selectedIds.value, id]))
    : selectedIds.value.filter((candidate) => candidate !== id)
}

function togglePage(selected: boolean) {
  selectedIds.value = selected
    ? rows.value.slice(0, automaticModerationSelectionLimit).map((row) => row.id)
    : []
}

async function runAutomaticModeration(ids: string[], pendingId: string | null) {
  if (ids.length === 0 || processingQueue.value || batchPending.value) return
  actionError.value = ''
  actionNotice.value = ''
  if (pendingId) pendingIds.value = [...pendingIds.value, pendingId]
  else batchPending.value = true
  let completedItems = 0
  try {
    let succeeded = 0
    let failed = 0
    for (let offset = 0; offset < ids.length; offset += automaticModerationRequestLimit) {
      const batchIds = ids.slice(offset, offset + automaticModerationRequestLimit)
      const response = await autoModerateComments(batchIds)
      succeeded += response.data.summary.succeeded
      failed += response.data.summary.failed
      completedItems += batchIds.length
      const completed = new Set<string>()
      for (const result of response.data.results) {
        if (result.status === 'approved' || result.status === 'rejected') {
          updateVisibleComment(result.id, result.status)
          completed.add(result.id)
        }
      }
      selectedIds.value = selectedIds.value.filter((id) => !completed.has(id))
    }
    actionNotice.value = t('moderation.autoModerationSummary', { succeeded, failed })
    await synchronizeAfterMutation()
  } catch (caught) {
    const error = apiErrorMessage(caught, t('moderation.autoModerationError'))
    if (completedItems > 0) {
      await refreshMetrics().catch(() => {})
      actionError.value = `${t('moderation.autoModerationPartialError', {
        completed: completedItems,
        remaining: ids.length - completedItems
      })} ${error}`
    } else {
      actionError.value = error
    }
  } finally {
    if (pendingId) pendingIds.value = pendingIds.value.filter((id) => id !== pendingId)
    batchPending.value = false
  }
}

async function runManualModeration(status: Exclude<AdminCommentStatus, 'pending'>) {
  if (selectedIds.value.length === 0 || processingQueue.value || batchPending.value) return
  batchPending.value = true
  actionError.value = ''
  actionNotice.value = ''
  let succeeded = 0
  let failed = 0
  const failedIds: string[] = []
  try {
    for (const id of [...selectedIds.value]) {
      try {
        await moderateComment(id, status)
        updateVisibleComment(id, status)
        succeeded += 1
      } catch {
        failed += 1
        failedIds.push(id)
      }
    }
    selectedIds.value = failedIds
    actionNotice.value = t('moderation.batchSummary', { succeeded, failed })
    await synchronizeAfterMutation()
  } finally {
    batchPending.value = false
  }
}

function moderate(id: string, status: Exclude<AdminCommentStatus, 'pending'>) {
  queueAction(
    id,
    async () => {
      await moderateComment(id, status)
      updateVisibleComment(id, status)
    },
    status === 'approved' ? t('moderation.approveError') : t('moderation.rejectError')
  )
}

function autoModerate(id: string) {
  queueAction(id, async () => {
    const response = await autoModerateComments([id])
    const result = response.data.results[0]
    if (result?.status === 'approved' || result?.status === 'rejected') {
      updateVisibleComment(id, result.status)
    }
    actionNotice.value = t('moderation.autoModerationSummary', {
      succeeded: response.data.summary.succeeded,
      failed: response.data.summary.failed
    })
  }, t('moderation.autoModerationError'))
}

function autoModerateSelected() {
  void runAutomaticModeration(selectedIds.value, null)
}

function approveSelected() {
  void runManualModeration('approved')
}

function rejectSelected() {
  void runManualModeration('rejected')
}

function remove(id: string) {
  if (batchPending.value || pendingIds.value.includes(id) || !confirm(t('moderation.deleteConfirm'))) {
    return
  }
  queueAction(id, async () => {
    await deleteComment(id)
    removeVisibleComment(id)
  }, t('moderation.deleteError'))
}
</script>

<template>
  <section class="comment-moderation">
    <header class="comment-moderation__header">
      <div>
        <p class="comment-moderation__eyebrow">{{ t('moderation.eyebrow') }}</p>
        <h1 class="comment-moderation__title">{{ t('moderation.title') }}</h1>
        <p class="comment-moderation__meta">{{ t('moderation.meta') }}</p>
      </div>
      <CommentStatusFilter :status="filterStatus" :disabled="batchPending" @change="changeFilter" />
    </header>

    <p v-if="actionError" class="comment-moderation__alert" role="alert" data-test="comment-action-error">
      {{ actionError }}
    </p>
    <p v-if="actionNotice" class="comment-moderation__notice" role="status" data-test="comment-action-notice">
      {{ actionNotice }}
    </p>

    <template v-if="!data">
      <p v-if="readError" class="comment-moderation__alert" role="alert" data-test="comment-read-error">{{ readError }}</p>
      <p v-else-if="pending" class="comment-moderation__loading">{{ t('comments.loading') }}</p>
    </template>
    <template v-else>
      <p v-if="readError" class="comment-moderation__alert" role="alert" data-test="comment-sync-error">{{ readError }}</p>
      <div class="comment-moderation__bulk" :aria-busy="batchPending">
        <span>{{ t('moderation.selectedCount', { count: selectedIds.length }) }}</span>
        <small>{{ t('moderation.autoModerationLimit', {
          selectionLimit: automaticModerationSelectionLimit,
          requestLimit: automaticModerationRequestLimit
        }) }}</small>
        <button
          type="button"
          class="comment-moderation__bulk-button comment-moderation__bulk-button--approve"
          data-test="comment-approve-selected"
          :disabled="selectedIds.length === 0 || processingQueue || batchPending"
          @click="approveSelected"
        >{{ t('moderation.approveSelected') }}</button>
        <button
          type="button"
          class="comment-moderation__bulk-button"
          data-test="comment-reject-selected"
          :disabled="selectedIds.length === 0 || processingQueue || batchPending"
          @click="rejectSelected"
        >{{ t('moderation.rejectSelected') }}</button>
        <button
          type="button"
          class="comment-moderation__bulk-button"
          data-test="comment-auto-moderate-selected"
          :disabled="selectedIds.length === 0 || processingQueue || batchPending"
          @click="autoModerateSelected"
        >{{ batchPending ? t('moderation.autoModerating') : t('moderation.autoModerateSelected') }}</button>
      </div>
      <CommentModerationTable
        :rows="rows"
        :pending-ids="pendingIds"
        :selected-ids="selectedIds"
        :batch-pending="batchPending"
        @approve="moderate($event, 'approved')"
        @reject="moderate($event, 'rejected')"
        @auto-moderate="autoModerate"
        @delete="remove"
        @toggle-selection="toggleSelection"
        @toggle-page="togglePage"
      />

      <CommentPagination
        :total="total"
        :offset="offset"
        :limit="limit"
        :disabled="batchPending"
        @prev="previousPage"
        @next="nextPage"
      />
    </template>
  </section>
</template>

<style scoped>
.comment-moderation {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.comment-moderation__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-line);
}

.comment-moderation__eyebrow {
  margin: 0 0 4px;
  color: var(--color-accent-warm);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.comment-moderation__title {
  margin: 0;
  color: var(--color-text);
  font-size: 1.5rem;
}

.comment-moderation__meta,
.comment-moderation__loading {
  margin: 4px 0 0;
  color: var(--color-muted);
  font-size: 0.84rem;
}

.comment-moderation__alert {
  margin: 0;
  padding: 9px 11px;
  border-inline-start: 3px solid var(--color-accent-warm);
  background: var(--admin-warm-subtle);
  color: var(--color-accent-warm);
  font-size: 0.84rem;
}

.comment-moderation__notice {
  margin: 0;
  padding: 9px 11px;
  border-inline-start: 3px solid var(--admin-info);
  background: rgba(var(--admin-info-rgb), 0.1);
  color: var(--admin-info);
  font-size: 0.84rem;
}

.comment-moderation__bulk {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-muted);
  font-size: 0.8rem;
}

.comment-moderation__bulk-button {
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: var(--color-panel);
  color: var(--admin-info);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.comment-moderation__bulk-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.comment-moderation__bulk-button--approve {
  color: var(--admin-success);
}

@media (max-width: 720px) {
  .comment-moderation__header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
