<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import PostListTable from '~/components/admin/PostListTable.vue'
import { apiErrorMessage, deletePost, updatePost, useAdminIntegrations, useAdminPosts, useAdminTaxonomyOptions, type UpdatePostBody } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const postsRequest = useAdminPosts()
const taxonomyRequest = useAdminTaxonomyOptions()
const integrationsRequest = useAdminIntegrations()
const [
  { data, error, pending, refresh },
  { data: taxonomyData },
  { data: integrationData, refresh: refreshIntegrations }
] = await Promise.all([postsRequest, taxonomyRequest, integrationsRequest])
const errorMessage = shallowRef('')
const noticeMessage = shallowRef('')
const pendingIds = shallowRef<string[]>([])
const processingQueue = shallowRef(false)
const actionQueue: Array<{ id: string; label: string; fallback: string; action: () => Promise<void> }> = []
const { t } = useTblogI18n()
const searchSyncError = computed(() => integrationData.value?.data.find((item) =>
  item.capability === 'search' && item.providerKey === 'algolia'
)?.lastError ?? '')

async function refreshIntegrationStatus() {
  try { await refreshIntegrations() } catch { /* the saved post state remains authoritative */ }
}

async function processQueue() {
  if (processingQueue.value) return
  processingQueue.value = true
  const failures: string[] = []
  let completed = 0
  errorMessage.value = ''
  try {
    while (actionQueue.length) {
      const queued = actionQueue.shift()
      if (!queued) continue
      try { await queued.action(); completed += 1 } catch (error) {
        failures.push(`${queued.label}: ${apiErrorMessage(error, queued.fallback)}`)
      } finally {
        pendingIds.value = pendingIds.value.filter((id) => id !== queued.id)
      }
    }
  } finally {
    errorMessage.value = failures.join(' ')
    if (completed > 0) void refreshIntegrationStatus()
    processingQueue.value = false
  }
}

function postLabel(id: string) {
  return data.value?.data.find((post) => post.id === id)?.title ?? id
}

function queuePostAction(id: string, action: () => Promise<void>, fallback = t('admin.updatePostError')) {
  if (pendingIds.value.includes(id)) return
  pendingIds.value = [...pendingIds.value, id]
  actionQueue.push({ id, label: postLabel(id), fallback, action })
  void processQueue()
}

function updateLocalPost(id: string, post: NonNullable<typeof data.value>['data'][number]) {
  if (!data.value) return
  data.value = { ...data.value, data: data.value.data.map((item) => item.id === id ? { ...item, ...post } : item) }
}

function handleDelete(id: string) {
  if (!window.confirm(t('admin.deletePostConfirm'))) {
    return
  }

  errorMessage.value = ''
  noticeMessage.value = ''
  queuePostAction(id, async () => {
    await deletePost(id)
    if (data.value) {
      data.value = { ...data.value, data: data.value.data.filter((post) => post.id !== id) }
    } else {
      await refresh()
    }
  }, t('admin.deletePostError'))
}

function patchPost(id: string, body: UpdatePostBody) {
  errorMessage.value = ''
  noticeMessage.value = ''
  queuePostAction(id, async () => {
    const response = await updatePost(id, body)
    if (data.value) updateLocalPost(id, response.data)
    else await refresh()
  })
}

async function runBulk(ids: string[], bodyFor: (post: NonNullable<typeof data.value>['data'][number]) => UpdatePostBody | null) {
  if (processingQueue.value || ids.length === 0 || !data.value) return
  processingQueue.value = true
  errorMessage.value = ''
  noticeMessage.value = ''
  pendingIds.value = Array.from(new Set([...pendingIds.value, ...ids]))
  let succeeded = 0
  let unchanged = 0
  const failures: string[] = []
  try {
    for (const id of ids) {
      const post = data.value?.data.find((item) => item.id === id)
      if (!post) { unchanged += 1; continue }
      const body = bodyFor(post)
      if (!body) { unchanged += 1; continue }
      try {
        const response = await updatePost(id, body)
        updateLocalPost(id, response.data)
        succeeded += 1
      } catch (error) {
        failures.push(`${post.title}: ${apiErrorMessage(error, t('admin.updatePostError'))}`)
      }
    }
    noticeMessage.value = t('posts.bulkSummary', { succeeded, failed: failures.length, unchanged })
    errorMessage.value = failures.join(' ')
    void refreshIntegrationStatus()
  } finally {
    pendingIds.value = pendingIds.value.filter((id) => !ids.includes(id))
    processingQueue.value = false
    // Row actions queued while this bulk run held `processingQueue` were skipped by processQueue()'s
    // busy-guard. Drain them now, otherwise they stay stuck in actionQueue and their ids never leave
    // pendingIds (the affected rows would appear to hang forever).
    if (actionQueue.length > 0) void processQueue()
  }
}

function bulkPublish(ids: string[]) {
  if (!confirm(t('posts.bulkPublishConfirm', { count: ids.length }))) return
  void runBulk(ids, (post) => post.status === 'draft' ? { status: 'published' } : null)
}

function bulkCategory(payload: { ids: string[]; categoryId: string }) {
  void runBulk(payload.ids, (post) => post.type === 'article' && post.categoryId !== payload.categoryId
    ? { categoryId: payload.categoryId }
    : null)
}

function bulkTag(payload: { ids: string[]; tagId: string; mode: 'add' | 'remove' }) {
  void runBulk(payload.ids, (post) => {
    if (post.type !== 'article') return null
    const hasTag = post.tagIds.includes(payload.tagId)
    if ((payload.mode === 'add' && hasTag) || (payload.mode === 'remove' && !hasTag)) return null
    return { tagIds: payload.mode === 'add'
      ? [...post.tagIds, payload.tagId]
      : post.tagIds.filter((id) => id !== payload.tagId) }
  })
}

function bulkFeatured(payload: { ids: string[]; featured: boolean }) {
  void runBulk(payload.ids, (post) => post.type === 'article' && post.status === 'published' && post.featured !== payload.featured
    ? { featured: payload.featured }
    : null)
}

function handleFeature(id: string, featured: boolean) {
  patchPost(id, { featured })
}
</script>

<template>
  <section class="admin-posts">
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-header__title">{{ t('admin.posts') }}</h1>
        <p class="admin-page-header__meta">{{ t('admin.postsMeta') }}</p>
      </div>
      <NuxtLink class="admin-page-header__action" to="/admin/posts/new">{{ t('admin.newPost') }}</NuxtLink>
    </div>

    <p v-if="error || errorMessage" class="admin-alert" role="alert">
      {{ errorMessage || t('admin.postsUnavailable') }}
    </p>
    <p v-if="noticeMessage" class="admin-muted" role="status" data-test="post-action-notice">{{ noticeMessage }}</p>
    <p v-if="searchSyncError" class="admin-alert" role="alert" data-test="search-sync-warning">
      {{ t('admin.searchSyncWarning', { message: searchSyncError }) }}
    </p>
    <p v-if="pending" class="admin-muted">{{ t('admin.loadingPosts') }}</p>
    <PostListTable
      v-else
      :posts="data?.data ?? []"
      :tags="taxonomyData?.data.tags ?? []"
      :categories="taxonomyData?.data.categories ?? []"
      :pending-ids="pendingIds"
      @delete="handleDelete"
      @feature="handleFeature"
      @publish="patchPost($event, { status: 'published' })"
      @unpublish="patchPost($event, { status: 'draft' })"
      @category="patchPost($event.id, { categoryId: $event.categoryId })"
      @tags="patchPost($event.id, { tagIds: $event.tagIds })"
      @bulk-publish="bulkPublish"
      @bulk-category="bulkCategory"
      @bulk-tag="bulkTag"
      @bulk-featured="bulkFeatured"
    />
  </section>
</template>
