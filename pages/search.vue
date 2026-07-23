<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  searchAlgolia,
  useSearchConfigState,
  MAX_SEARCH_QUERY_LENGTH,
  type SearchHit,
  type SearchConfigPayload
} from '~/composables/usePublicSearch'
import { useTblogI18n } from '~/composables/useTblogI18n'

const { t } = useTblogI18n()
// Search is a utility surface (often thin/query-driven); do not index it.
useHead(() => ({
  title: t('nav.search'),
  meta: [{ name: 'robots', content: 'noindex,follow', key: 'robots' }]
}))
const route = useRoute()
const router = useRouter()

const { data: configData, status: configStatus } = useSearchConfigState()

// Only trust enabled/disabled once the config request has settled, so we never flash the
// "未启用" notice while the fetch is still in flight on a fresh client navigation.
const configResolved = computed(() => configStatus.value === 'success' || configStatus.value === 'error')
const searchEnabled = computed(() => configData.value?.data?.enabled === true)
const searchConfig = computed<SearchConfigPayload | null>(() => configData.value?.data?.config ?? null)

function routeQuery(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_SEARCH_QUERY_LENGTH) : ''
}

function routePage(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 0
  return Math.max(0, Number(value) - 1)
}

const query = ref(routeQuery(route.query.q))
const currentPage = ref(routePage(route.query.page))
const hits = ref<SearchHit[]>([])
const pending = ref(false)
const failed = ref(false)
const hasSearched = ref(false)
const totalHits = ref(0)
const totalPages = ref(0)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let requestToken = 0
let activeController: AbortController | null = null
let syncingFromRoute = false

function clearDebounce() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

function cancelActiveRequest() {
  activeController?.abort()
  activeController = null
}

async function runSearch(term: string, page = currentPage.value) {
  cancelActiveRequest()
  const controller = new AbortController()
  activeController = controller
  const token = ++requestToken
  pending.value = true
  failed.value = false
  hits.value = []
  totalHits.value = 0
  totalPages.value = 0

  const outcome = await searchAlgolia(searchConfig.value, term, controller.signal, { page, hitsPerPage: 20 })

  // Ignore results from a superseded request.
  if (token !== requestToken) return

  hits.value = outcome.hits
  failed.value = outcome.error
  totalHits.value = outcome.nbHits
  currentPage.value = outcome.page
  totalPages.value = outcome.nbPages
  hasSearched.value = true
  pending.value = false
  if (activeController === controller) activeController = null
}

function syncRoute(mode: 'replace' | 'push' = 'replace') {
  const q = query.value.trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
  const page = currentPage.value > 0 ? String(currentPage.value + 1) : undefined
  void router[mode]({
    query: {
      ...route.query,
      q: q || undefined,
      page
    }
  })
}

function scheduleSearch(value = query.value) {
  clearDebounce()

  const trimmed = value.trim()
  if (!searchEnabled.value || trimmed.length === 0) {
    cancelActiveRequest()
    requestToken += 1
    hits.value = []
    pending.value = false
    failed.value = false
    hasSearched.value = false
    totalHits.value = 0
    totalPages.value = 0
    return
  }

  // Search only on the client — fetch() to Algolia never runs during SSR (no window on the server).
  if (typeof window === 'undefined') return

  debounceTimer = setTimeout(() => {
    void runSearch(trimmed, currentPage.value)
  }, 250)
}

watch(query, (value) => {
  if (!syncingFromRoute) {
    currentPage.value = 0
    syncRoute('replace')
  }
  scheduleSearch(value)
})

watch(currentPage, (_page, previousPage) => {
  if (_page === previousPage) return
  if (syncingFromRoute) return
  scheduleSearch()
})

watch(
  () => [route.query.q, route.query.page] as const,
  async ([q, page]) => {
    syncingFromRoute = true
    const nextQuery = routeQuery(q)
    const nextPage = routePage(page)
    if (query.value !== nextQuery) query.value = nextQuery
    if (currentPage.value !== nextPage) currentPage.value = nextPage
    await nextTick()
    syncingFromRoute = false
    scheduleSearch()
  }
)

watch([searchEnabled, searchConfig], () => scheduleSearch())

onMounted(() => scheduleSearch())

onBeforeUnmount(() => {
  clearDebounce()
  cancelActiveRequest()
})

const showEmptyResult = computed(
  () => searchEnabled.value && hasSearched.value && !pending.value && !failed.value && hits.value.length === 0
)

function hitTags(hit: SearchHit) {
  return Array.isArray(hit.tags) ? hit.tags : []
}

function retrySearch() {
  void runSearch(query.value.trim(), currentPage.value)
}

function goToPage(page: number) {
  const next = Math.min(Math.max(0, page), Math.max(0, totalPages.value - 1))
  if (next === currentPage.value) return
  currentPage.value = next
  syncRoute('push')
}
</script>

<template>
  <div class="container search">
    <h1 class="search__heading">{{ t('nav.search') }}</h1>

    <p v-if="configResolved && !searchEnabled" class="search__notice">{{ t('search.disabled') }}</p>

    <template v-else-if="searchEnabled">
      <div class="search__field">
        <input
          v-model="query"
          class="search__input"
          type="search"
          name="q"
          :placeholder="t('search.placeholder')"
          :maxlength="MAX_SEARCH_QUERY_LENGTH"
          autocomplete="off"
          :aria-label="t('search.aria')"
        />
      </div>

      <p v-if="pending" class="search__status">{{ t('search.pending') }}</p>
      <div v-else-if="failed" class="search__status search__status--error">
        <span>{{ t('search.failed') }}</span>
        <button type="button" @click="retrySearch">{{ t('common.retry') }}</button>
      </div>
      <p v-else-if="showEmptyResult" class="search__status">{{ t('search.empty') }}</p>

      <div v-if="hasSearched && !failed && totalHits > 0" class="search__summary">
        <span>{{ t('search.resultCount', { count: totalHits }) }}</span>
        <span v-if="totalPages > 1">{{ t('search.pageStatus', { page: currentPage + 1, pages: totalPages }) }}</span>
      </div>

      <ul v-if="hits.length" class="search__results">
        <li v-for="hit in hits" :key="hit.objectID" class="search-result">
          <h2 class="search-result__title">
            <NuxtLink class="search-result__link" :to="`/posts/${hit.slug}`">{{ hit.title }}</NuxtLink>
          </h2>

          <p v-if="hit.excerpt" class="search-result__excerpt">{{ hit.excerpt }}</p>

          <div class="search-result__meta">
            <NuxtLink
              v-if="hit.category"
              class="search-result__category"
              :to="`/categories/${hit.category.slug}`"
            >
              {{ hit.category.name }}
            </NuxtLink>
            <ul v-if="hitTags(hit).length" class="search-result__tags">
              <li v-for="tag in hitTags(hit)" :key="tag.slug">
                <NuxtLink class="search-result__tag" :to="`/tags/${tag.slug}`">{{ tag.name }}</NuxtLink>
              </li>
            </ul>
          </div>
        </li>
      </ul>

      <nav v-if="totalPages > 1" class="search__pagination" :aria-label="t('search.pagination')">
        <button type="button" :disabled="currentPage <= 0 || pending" @click="goToPage(currentPage - 1)">
          {{ t('search.previous') }}
        </button>
        <button type="button" :disabled="currentPage >= totalPages - 1 || pending" @click="goToPage(currentPage + 1)">
          {{ t('search.next') }}
        </button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.search {
  padding-block: 28px;
}

.search__heading {
  margin: 0 0 20px;
  font-size: 1.5rem;
  font-weight: 780;
}

.search__field {
  margin-bottom: 20px;
}

.search__input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-panel);
  color: var(--color-text);
  font-size: 1rem;
}

.search__input:focus-visible {
  outline: 2px solid var(--color-accent-warm);
  outline-offset: 2px;
}

.search__notice,
.search__status {
  color: var(--color-muted);
}

.search__status--error {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-accent-warm);
}

.search__status--error button,
.search__pagination button {
  padding: 7px 12px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-panel);
  cursor: pointer;
}

.search__summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  color: var(--color-muted);
  font-size: 0.82rem;
}

.search__results {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.search-result {
  padding: 18px 20px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-panel);
  box-shadow: var(--shadow-card);
}

.search-result__title {
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.3;
}

.search-result__link {
  color: var(--color-text);
  text-decoration: none;
  overflow-wrap: anywhere;
}

.search-result__link:hover {
  color: var(--color-accent);
}

.search-result__excerpt {
  margin: 8px 0 0;
  color: var(--color-muted);
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.search-result__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.search-result__category {
  color: var(--color-accent);
  font-size: 0.8rem;
  font-weight: 700;
  text-decoration: none;
}

.search-result__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.search-result__tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-page);
  color: var(--color-muted);
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: none;
}

.search-result__tag:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.search__pagination {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 22px;
}

.search__pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
