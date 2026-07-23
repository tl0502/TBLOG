<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import type { AdminPostListItemView, AdminPostStatus } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  posts: AdminPostListItemView[]
  tags?: Array<{ id: string; name: string }>
  categories?: Array<{ id: string; name: string }>
  pendingIds?: string[]
  /** Server-owned filters; the page refetches when these change. */
  search?: string
  status?: 'all' | AdminPostStatus
  tagId?: string
  total?: number
  offset?: number
  limit?: number
}

const props = withDefaults(defineProps<Props>(), {
  tags: () => [],
  categories: () => [],
  pendingIds: () => [],
  search: '',
  status: 'all',
  tagId: '',
  total: 0,
  offset: 0,
  limit: 25
})
const emit = defineEmits<{
  delete: [id: string]
  feature: [id: string, featured: boolean]
  publish: [id: string]
  unpublish: [id: string]
  category: [payload: { id: string; categoryId: string | null }]
  tags: [payload: { id: string; tagIds: string[] }]
  bulkPublish: [ids: string[]]
  bulkCategory: [payload: { ids: string[]; categoryId: string }]
  bulkTag: [payload: { ids: string[]; tagId: string; mode: 'add' | 'remove' }]
  bulkFeatured: [payload: { ids: string[]; featured: boolean }]
  'update:search': [value: string]
  'update:status': [value: 'all' | AdminPostStatus]
  'update:tagId': [value: string]
  prev: []
  next: []
}>()
const { formatDate, t } = useTblogI18n()
// Local mirror keeps the search input snappy while the parent owns the authoritative query.
const searchDraft = shallowRef(props.search)
watch(() => props.search, (value) => { searchDraft.value = value })

const selectedIds = ref<string[]>([])
const tagDrafts = reactive<Record<string, string[]>>({})
const bulkCategoryId = shallowRef('')
const bulkTagId = shallowRef('')
const bulkTagMode = shallowRef<'add' | 'remove'>('add')
const pendingSet = computed(() => new Set(props.pendingIds))
const selectedSet = computed(() => new Set(selectedIds.value))

function checked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}

type MenuKind = 'category' | 'tags'
const openMenus = reactive(new Set<string>())
const menuKey = (id: string, kind: MenuKind) => `${id}:${kind}`

function isMenuOpen(id: string, kind: MenuKind) {
  return openMenus.has(menuKey(id, kind))
}

// A row menu opens only on demand; its panel (every category/tag) stays out of the DOM until then,
// so the table renders O(rows) controls instead of O(rows × (categories + tags)) hidden nodes.
function toggleMenu(post: AdminPostListItemView, kind: MenuKind) {
  if (post.type !== 'article' || pendingSet.value.has(post.id)) return
  const key = menuKey(post.id, kind)
  if (openMenus.has(key)) openMenus.delete(key)
  else openMenus.add(key)
}

function closeMenu(id: string, kind: MenuKind) {
  openMenus.delete(menuKey(id, kind))
}

function categoryName(post: AdminPostListItemView) {
  return props.categories.find((category) => category.id === post.categoryId)?.name ?? t('editor.category')
}

function toggleDraftTag(post: AdminPostListItemView, tagId: string, enabled: boolean) {
  const current = tagDrafts[post.id] ?? [...post.tagIds]
  tagDrafts[post.id] = enabled
    ? Array.from(new Set([...current, tagId]))
    : current.filter((id) => id !== tagId)
}

function resetTagDraft(post: AdminPostListItemView) {
  tagDrafts[post.id] = [...post.tagIds]
}

function applyTagDraft(post: AdminPostListItemView) {
  const nextTags = [...(tagDrafts[post.id] ?? post.tagIds)]
  emit('tags', { id: post.id, tagIds: nextTags })
  tagDrafts[post.id] = [...post.tagIds]
  closeMenu(post.id, 'tags')
}

function toggleSelection(id: string, selected: boolean) {
  if (selected && !selectedIds.value.includes(id) && selectedIds.value.length >= 20) return
  selectedIds.value = selected
    ? Array.from(new Set([...selectedIds.value, id]))
    : selectedIds.value.filter((candidate) => candidate !== id)
}

// The server already applied search/status/tag/offset/limit; the table renders the page as-is.
const pagePosts = computed(() => props.posts)
const allVisibleSelected = computed(() => pagePosts.value.length > 0 && pagePosts.value.every((post) => selectedSet.value.has(post.id)))
const selectedPosts = computed(() => props.posts.filter((post) => selectedSet.value.has(post.id)))
const selectedDraftIds = computed(() => selectedPosts.value.filter((post) => post.status === 'draft').map((post) => post.id))
const selectedFeatureableIds = computed(() => selectedPosts.value.filter((post) => post.type === 'article' && post.status === 'published' && !post.featured).map((post) => post.id))
const selectedFeaturedIds = computed(() => selectedPosts.value.filter((post) => post.type === 'article' && post.status === 'published' && post.featured).map((post) => post.id))
const taxonomyBatchAllowed = computed(() => selectedPosts.value.length > 0 && selectedPosts.value.every((post) => post.type === 'article'))
const batchDisabled = computed(() => props.pendingIds.length > 0)
const hasPrevious = computed(() => props.offset > 0)
const hasNext = computed(() => props.offset + props.limit < props.total)
const rangeStart = computed(() => props.total === 0 ? 0 : Math.min(props.offset + 1, props.total))
const rangeEnd = computed(() => Math.min(props.offset + props.limit, props.total))
const showPagination = computed(() => props.total > props.limit)
const emptyBecauseFilter = computed(() =>
  props.total === 0
  && (props.search.trim().length > 0 || props.status !== 'all' || props.tagId.length > 0)
)
// Only treat as empty catalogue when the server match set is zero. An empty page with total > 0
// is a transient window (delete/offset clamp/refetch), not "no posts".
const isCatalogueEmpty = computed(() => props.total === 0 && props.posts.length === 0)

function toggleVisible(selected: boolean) {
  selectedIds.value = selected ? pagePosts.value.slice(0, 20).map((post) => post.id) : []
}

function commitSearch() {
  emit('update:search', searchDraft.value)
}

watch(() => props.posts, (posts) => {
  for (const post of posts) {
    if (!pendingSet.value.has(post.id)) tagDrafts[post.id] = [...post.tagIds]
  }
  const existing = new Set(posts.map((post) => post.id))
  selectedIds.value = selectedIds.value.filter((id) => existing.has(id))
}, { immediate: true })

watch([() => props.search, () => props.status, () => props.tagId, () => props.offset], () => {
  selectedIds.value = []
})
</script>

<template>
  <div class="post-list">
    <div class="post-list__filters">
      <label class="post-list__filter post-list__filter--search">
        <span>{{ t('posts.search') }}</span>
        <input
          v-model="searchDraft"
          type="search"
          :placeholder="t('posts.searchPlaceholder')"
          data-test="post-search"
          @change="commitSearch"
          @keyup.enter="commitSearch"
        />
      </label>
      <label class="post-list__filter">
        <span>{{ t('table.status') }}</span>
        <select
          :value="status"
          data-test="post-status-filter"
          @change="emit('update:status', ($event.target as HTMLSelectElement).value as 'all' | AdminPostStatus)"
        >
          <option value="all">{{ t('posts.allStatuses') }}</option>
          <option value="draft">{{ t('editor.draft') }}</option>
          <option value="published">{{ t('editor.published') }}</option>
        </select>
      </label>
      <label class="post-list__filter">
        <span>{{ t('admin.tags') }}</span>
        <select
          :value="tagId"
          data-test="post-tag-filter"
          @change="emit('update:tagId', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ t('posts.allTags') }}</option>
          <option v-for="tag in tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option>
        </select>
      </label>
    </div>

    <p v-if="isCatalogueEmpty && emptyBecauseFilter" class="post-list__empty">{{ t('posts.noMatches') }}</p>
    <p v-else-if="isCatalogueEmpty" class="post-list__empty">{{ t('posts.empty') }}</p>
    <template v-else-if="posts.length > 0">
    <div class="post-list__bulk" data-test="post-bulk-toolbar">
      <div class="post-list__bulk-summary">
        <span>{{ t('posts.batchActions') }}</span>
        <strong>{{ selectedIds.length }}<small>/20</small></strong>
      </div>
      <div class="post-list__bulk-group post-list__bulk-group--state">
        <button type="button" :disabled="batchDisabled || selectedDraftIds.length === 0" data-test="bulk-publish" @click="emit('bulkPublish', selectedDraftIds)">{{ t('posts.bulkPublish', { count: selectedDraftIds.length }) }}</button>
        <button type="button" :disabled="batchDisabled || selectedFeatureableIds.length === 0" data-test="bulk-feature" @click="emit('bulkFeatured', { ids: selectedFeatureableIds, featured: true })">{{ t('posts.bulkFeature', { count: selectedFeatureableIds.length }) }}</button>
        <button type="button" :disabled="batchDisabled || selectedFeaturedIds.length === 0" data-test="bulk-unfeature" @click="emit('bulkFeatured', { ids: selectedFeaturedIds, featured: false })">{{ t('posts.bulkUnfeature', { count: selectedFeaturedIds.length }) }}</button>
      </div>
      <div class="post-list__bulk-group">
        <label>
          <span>{{ t('editor.category') }}</span>
          <select v-model="bulkCategoryId" :disabled="batchDisabled || !taxonomyBatchAllowed">
            <option value="">{{ t('posts.chooseCategory') }}</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
          </select>
        </label>
        <button type="button" :disabled="batchDisabled || !taxonomyBatchAllowed || !bulkCategoryId" data-test="bulk-category" @click="emit('bulkCategory', { ids: [...selectedIds], categoryId: bulkCategoryId })">{{ t('posts.applyCategory') }}</button>
      </div>
      <div class="post-list__bulk-group">
        <label>
          <span>{{ t('editor.tags') }}</span>
          <select v-model="bulkTagId" :disabled="batchDisabled || !taxonomyBatchAllowed">
            <option value="">{{ t('posts.chooseTag') }}</option>
            <option v-for="tag in tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option>
          </select>
        </label>
        <select v-model="bulkTagMode" :disabled="batchDisabled || !taxonomyBatchAllowed" :aria-label="t('posts.tagMode')">
          <option value="add">{{ t('posts.addTag') }}</option>
          <option value="remove">{{ t('posts.removeTag') }}</option>
        </select>
        <button type="button" :disabled="batchDisabled || !taxonomyBatchAllowed || !bulkTagId" data-test="bulk-tag" @click="emit('bulkTag', { ids: [...selectedIds], tagId: bulkTagId, mode: bulkTagMode })">{{ t('common.apply') }}</button>
      </div>
      <small v-if="selectedPosts.some((post) => post.type !== 'article')">{{ t('posts.articleOnlyBatch') }}</small>
    </div>
    <table class="post-list__table">
      <thead>
        <tr>
          <th class="post-list__select" scope="col"><input type="checkbox" :checked="allVisibleSelected" :aria-label="t('posts.selectVisible')" data-test="post-select-visible" @change="toggleVisible(checked($event))"></th>
          <th scope="col">{{ t('table.title') }}</th>
          <th scope="col">{{ t('table.type') }}</th>
          <th scope="col">{{ t('table.status') }}</th>
          <th scope="col">{{ t('table.updated') }}</th>
          <th scope="col">{{ t('table.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="post in pagePosts" :key="post.id">
          <td class="post-list__select"><input type="checkbox" :checked="selectedSet.has(post.id)" :disabled="pendingSet.has(post.id)" :aria-label="t('posts.selectPost', { title: post.title })" :data-test="`select-${post.id}`" @change="toggleSelection(post.id, checked($event))"></td>
          <td>
            <span class="post-list__title-line">
              <span v-if="post.featured" class="post-list__featured" :title="t('editor.featured')" :aria-label="t('editor.featured')">⭐</span>
              <NuxtLink class="post-list__title" :to="`/admin/posts/${post.id}`">{{ post.title }}</NuxtLink>
            </span>
            <span class="post-list__slug">{{ post.slug }}</span>
          </td>
          <td>{{ post.type }}</td>
          <td>
            <span class="post-list__status" :class="`post-list__status--${post.status}`">
              {{ post.status === 'published' ? t('editor.published') : t('editor.draft') }}
            </span>
          </td>
          <td>{{ formatDate(post.updatedAt) }}</td>
          <td>
            <div class="post-list__actions">
              <details class="post-list__menu" :open="isMenuOpen(post.id, 'category')" :class="{ 'is-disabled': post.type !== 'article' || pendingSet.has(post.id) }">
                <summary class="post-list__menu-button" :aria-disabled="post.type !== 'article' || pendingSet.has(post.id)" :data-test="`category-${post.id}`" @click.prevent="toggleMenu(post, 'category')">{{ categoryName(post) }}</summary>
                <div v-if="post.type === 'article' && isMenuOpen(post.id, 'category')" class="post-list__menu-panel post-list__menu-panel--category">
                  <button v-for="category in categories" :key="category.id" type="button" :class="{ 'is-active': category.id === post.categoryId }" :disabled="pendingSet.has(post.id)" :data-test="`category-${post.id}-${category.id}`" @click="emit('category', { id: post.id, categoryId: category.id }); closeMenu(post.id, 'category')">{{ category.name }}</button>
                </div>
              </details>
              <details class="post-list__menu" :open="isMenuOpen(post.id, 'tags')" :class="{ 'is-disabled': post.type !== 'article' || pendingSet.has(post.id) }">
                <summary class="post-list__menu-button" :aria-disabled="post.type !== 'article' || pendingSet.has(post.id)" :data-test="`tags-${post.id}`" @click.prevent="toggleMenu(post, 'tags')">{{ t('editor.tags') }} <span class="post-list__count">{{ post.tagIds.length }}</span></summary>
                <div v-if="post.type === 'article' && isMenuOpen(post.id, 'tags')" class="post-list__menu-panel post-list__menu-panel--tags">
                  <label v-for="tag in tags" :key="tag.id">
                    <input type="checkbox" :checked="(tagDrafts[post.id] ?? post.tagIds).includes(tag.id)" :disabled="pendingSet.has(post.id)" :data-test="`tag-${post.id}-${tag.id}`" @change="toggleDraftTag(post, tag.id, checked($event))">
                    <span>{{ tag.name }}</span>
                  </label>
                  <div class="post-list__menu-footer">
                    <button type="button" :disabled="pendingSet.has(post.id)" @click="resetTagDraft(post); closeMenu(post.id, 'tags')">{{ t('common.cancel') }}</button>
                    <button type="button" class="is-primary" :disabled="pendingSet.has(post.id)" :data-test="`save-tags-${post.id}`" @click="applyTagDraft(post)">{{ t('common.save') }}</button>
                  </div>
                </div>
              </details>
              <button type="button" class="post-list__feature" :class="{ 'is-active': post.featured }" :data-test="`feature-${post.id}`" :disabled="pendingSet.has(post.id) || post.status !== 'published' || post.type !== 'article'" @click="emit('feature', post.id, !post.featured)">{{ post.featured ? t('posts.unfeature') : t('posts.feature') }}</button>
              <button type="button" class="post-list__publish" :data-test="`publish-${post.id}`" :disabled="pendingSet.has(post.id)" @click="post.status === 'published' ? emit('unpublish', post.id) : emit('publish', post.id)">{{ post.status === 'published' ? t('editor.unpublish') : t('editor.publish') }}</button>
              <NuxtLink class="post-list__edit" :to="`/admin/posts/${post.id}`">{{ t('common.edit') }}</NuxtLink>
              <button type="button" class="post-list__delete" :data-test="`delete-${post.id}`" :disabled="pendingSet.has(post.id)" @click="emit('delete', post.id)">{{ t('common.delete') }}</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="showPagination" class="post-list__pagination" :aria-label="t('posts.pages')" data-test="post-pagination">
      <p class="post-list__range">{{ t('posts.range', { start: rangeStart, end: rangeEnd, total }) }}</p>
      <div class="post-list__page-actions">
        <button type="button" data-test="post-page-prev" :disabled="batchDisabled || !hasPrevious" @click="emit('prev')">{{ t('posts.previous') }}</button>
        <button type="button" data-test="post-page-next" :disabled="batchDisabled || !hasNext" @click="emit('next')">{{ t('posts.next') }}</button>
      </div>
    </div>
    </template>
  </div>
</template>

<style scoped>
.post-list { display: grid; gap: 14px; }
.post-list__filters, .post-list__bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.post-list__filter, .post-list__bulk label { display: grid; gap: 4px; color: var(--color-muted); font-size: .72rem; font-weight: 700; }
.post-list__filter input, .post-list__filter select, .post-list__bulk select { min-height: 36px; padding: 6px 10px; border: 1px solid var(--color-line); border-radius: 9px; background: var(--color-panel); color: var(--color-text); font: inherit; }
.post-list__filter--search { flex: 1 1 240px; }
.post-list__bulk { padding: 8px; border: 1px solid var(--color-line); border-radius: 14px; background: var(--color-panel); box-shadow: 0 8px 24px rgba(0, 0, 0, .035); }
.post-list__bulk-summary { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 5px 12px; border-radius: 10px; background: var(--admin-hover); color: var(--color-muted); font-size: .72rem; font-weight: 800; }
.post-list__bulk-summary strong { color: var(--color-accent); font-size: 1rem; font-variant-numeric: tabular-nums; }
.post-list__bulk-summary small { color: var(--color-muted); font-size: .68rem; }
.post-list__bulk-group { display: flex; align-items: end; gap: 6px; min-height: 42px; padding-inline-start: 10px; border-inline-start: 1px solid var(--color-line); }
.post-list__bulk-group button { min-height: 34px; padding: 6px 10px; border: 1px solid var(--color-line); border-radius: 9px; background: var(--color-page); color: var(--admin-info); font: inherit; font-size: .74rem; font-weight: 800; cursor: pointer; }
.post-list__bulk-group button:disabled { opacity: .4; cursor: default; }
.post-list__bulk small { flex-basis: 100%; color: var(--color-accent-warm); }
.post-list__table { width: 100%; border-collapse: collapse; border: 1px solid var(--color-line); background: var(--color-panel); box-shadow: var(--shadow-card); }
.post-list__table th, .post-list__table td { padding: 11px 12px; border-bottom: 1px solid var(--color-line); text-align: left; vertical-align: top; }
.post-list__select { width: 36px; text-align: center !important; }
.post-list__title { color: var(--color-text); font-weight: 800; }
.post-list__title-line { display: inline-flex; align-items: baseline; gap: 4px; padding: 0; border: 0; background: transparent; }
.post-list__slug { display: block; margin-top: 3px; color: var(--color-muted); font-size: .72rem; }
.post-list__status, .post-list__count { display: inline-flex; padding: 2px 7px; border-radius: 999px; background: var(--admin-hover); color: var(--color-accent); font-size: .68rem; font-weight: 800; }
.post-list__featured { display: inline-block; flex: 0 0 auto; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: #d9a400; font-size: .9rem; line-height: 1; vertical-align: baseline; filter: saturate(1.15); }
.post-list__actions { position: relative; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 7px; min-width: 310px; }
.post-list__actions > button, .post-list__edit, .post-list__menu-button { min-height: 32px; padding: 5px 9px; border: 1px solid var(--color-line); border-radius: 999px; background: var(--color-panel); color: var(--color-text); font: inherit; font-size: .74rem; font-weight: 800; text-decoration: none; cursor: pointer; }
.post-list__actions > button:disabled { opacity: .45; cursor: default; }
.post-list__delete { color: var(--color-accent-warm) !important; }
.post-list__menu { position: relative; }
.post-list__menu summary { list-style: none; }
.post-list__menu summary::-webkit-details-marker { display: none; }
.post-list__menu[open] .post-list__menu-button { border-color: var(--color-accent); color: var(--color-accent); }
.post-list__menu.is-disabled .post-list__menu-button { opacity: .42; cursor: default; }
.post-list__menu-panel { position: absolute; z-index: 20; inset-block-start: calc(100% + 6px); inset-inline-end: 0; display: grid; gap: 5px; width: 240px; max-height: 300px; padding: 9px; overflow-y: auto; border: 1px solid var(--color-line); border-radius: 12px; background: var(--color-panel); box-shadow: var(--shadow-card); }
.post-list__menu-panel--category button { padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--color-text); text-align: left; cursor: pointer; }
.post-list__menu-panel--category button:hover, .post-list__menu-panel--category button.is-active { background: var(--admin-hover); color: var(--color-accent); }
.post-list__menu-panel--tags label { display: flex; align-items: center; gap: 8px; padding: 6px 7px; border-radius: 7px; color: var(--color-text); }
.post-list__menu-panel--tags label:hover { background: var(--admin-hover); }
.post-list__menu-footer { position: sticky; inset-block-end: -9px; display: flex; justify-content: flex-end; gap: 7px; margin: 4px -9px -9px; padding: 9px; border-top: 1px solid var(--color-line); background: var(--color-panel); }
.post-list__menu-footer button { padding: 6px 10px; border: 1px solid var(--color-line); border-radius: 8px; background: var(--color-page); color: var(--color-text); font: inherit; font-weight: 700; }
.post-list__menu-footer button.is-primary { background: var(--color-accent); color: white; }
.post-list__empty { color: var(--color-muted); }
.post-list__pagination { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-top: 4px; }
.post-list__range { margin: 0; color: var(--color-muted); font-size: .8rem; font-variant-numeric: tabular-nums; }
.post-list__page-actions { display: flex; gap: 7px; }
.post-list__page-actions button { min-height: 34px; padding: 6px 11px; border: 1px solid var(--color-line); border-radius: 8px; background: var(--color-page); color: var(--color-text); font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer; }
.post-list__page-actions button:disabled { opacity: .45; cursor: default; }
button:focus-visible, summary:focus-visible, select:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
@media (max-width: 900px) { .post-list { overflow-x: auto; } .post-list__table { min-width: 980px; } .post-list__bulk-group { border-inline-start: 0; padding-inline-start: 0; } }
</style>
