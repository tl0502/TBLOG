<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  searchAlgolia,
  MAX_SEARCH_QUERY_LENGTH,
  type SearchConfigPayload,
  type SearchHit
} from '~/composables/usePublicSearch'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { useTblogTheme } from '~/composables/useTblogTheme'

interface Props {
  enabled?: boolean
  config?: SearchConfigPayload | null
}

const props = withDefaults(defineProps<Props>(), {
  enabled: false,
  config: null
})
const { t } = useTblogI18n()
const { preference, lightTheme, resolvedTheme } = useTblogTheme()
const open = ref(false)
const input = ref<HTMLInputElement | null>(null)
const query = ref('')
const hits = ref<SearchHit[]>([])
const pending = ref(false)
const failed = ref(false)
const searched = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let activeController: AbortController | null = null
let requestToken = 0

const trimmedQuery = computed(() => query.value.trim().slice(0, MAX_SEARCH_QUERY_LENGTH))
const allResultsTo = computed(() => ({ path: '/search', query: { q: trimmedQuery.value } }))

function clearDebounce() {
  if (!debounceTimer) return
  clearTimeout(debounceTimer)
  debounceTimer = null
}

function cancelRequest() {
  activeController?.abort()
  activeController = null
}

function openDialog() {
  if (!props.enabled || !props.config) return
  open.value = true
  void nextTick(() => input.value?.focus())
}

function closeDialog() {
  open.value = false
  clearDebounce()
  cancelRequest()
  requestToken += 1
  pending.value = false
}

async function runSearch() {
  const term = trimmedQuery.value
  if (!term || !props.config) return
  cancelRequest()
  const controller = new AbortController()
  activeController = controller
  const token = ++requestToken
  pending.value = true
  failed.value = false
  hits.value = []
  const result = await searchAlgolia(props.config, term, controller.signal, { hitsPerPage: 5 })
  if (token !== requestToken) return
  hits.value = result.hits
  failed.value = result.error
  searched.value = true
  pending.value = false
  if (activeController === controller) activeController = null
}

function scheduleSearch() {
  clearDebounce()
  if (!trimmedQuery.value || !props.enabled || !props.config) {
    cancelRequest()
    requestToken += 1
    hits.value = []
    pending.value = false
    failed.value = false
    searched.value = false
    return
  }
  debounceTimer = setTimeout(() => void runSearch(), 200)
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    if (!props.enabled || !props.config) return
    event.preventDefault()
    open.value ? closeDialog() : openDialog()
    return
  }
  if (event.key === 'Escape' && open.value) closeDialog()
}

watch(query, scheduleSearch)
watch(() => [props.enabled, props.config] as const, ([enabled, config]) => {
  if (!enabled || !config) closeDialog()
})

onMounted(() => window.addEventListener('keydown', handleGlobalKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  clearDebounce()
  cancelRequest()
})
</script>

<template>
  <div v-if="props.enabled && props.config" class="site-search">
    <button
      type="button"
      class="site-search__trigger"
      :aria-label="t('search.open')"
      :title="t('search.open')"
      aria-keyshortcuts="Control+K Meta+K"
      @click="openDialog"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.8" cy="10.8" r="6.3" />
        <path d="m16 16 4.2 4.2" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        class="site-shell site-search__backdrop"
        :data-theme="resolvedTheme"
        :data-color-mode="preference"
        :data-light-theme="lightTheme"
        @mousedown.self="closeDialog"
      >
        <section
          class="site-search__dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="t('search.dialogTitle')"
        >
          <div class="site-search__dialog-head">
            <label class="site-search__field">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.3" />
                <path d="m16 16 4.2 4.2" />
              </svg>
              <input
                ref="input"
                v-model="query"
                type="text"
                role="searchbox"
                :maxlength="MAX_SEARCH_QUERY_LENGTH"
                :placeholder="t('search.placeholder')"
                :aria-label="t('search.aria')"
                autocomplete="off"
              />
            </label>
            <button type="button" class="site-search__close" :aria-label="t('search.close')" @click="closeDialog">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div class="site-search__body" aria-live="polite">
            <p v-if="pending" class="site-search__status">{{ t('search.pending') }}</p>
            <div v-else-if="failed" class="site-search__status site-search__status--error">
              <span>{{ t('search.failed') }}</span>
              <button type="button" @click="runSearch">{{ t('common.retry') }}</button>
            </div>
            <p v-else-if="searched && hits.length === 0" class="site-search__status">{{ t('search.empty') }}</p>
            <p v-else-if="!searched" class="site-search__hint">{{ t('search.shortcutHint') }}</p>

            <ul v-if="hits.length" class="site-search__results">
              <li v-for="hit in hits" :key="hit.objectID">
                <NuxtLink :to="`/posts/${hit.slug}`" class="site-search__result" @click="closeDialog">
                  <strong>{{ hit.title }}</strong>
                  <span v-if="hit.excerpt">{{ hit.excerpt }}</span>
                </NuxtLink>
              </li>
            </ul>
          </div>

          <NuxtLink
            v-if="trimmedQuery"
            class="site-search__all"
            :to="allResultsTo"
            @click="closeDialog"
          >
            {{ t('search.allResults') }}
          </NuxtLink>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.site-search { display: inline-flex; flex: 0 0 auto; margin-inline-end: 3px; }
.site-search__trigger { display: inline-grid; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 8px; color: var(--color-muted); background: transparent; cursor: pointer; place-items: center; }
.site-search__trigger:hover { color: var(--color-accent-warm); background: rgba(var(--color-accent-rgb), 0.08); }
.site-search__trigger:focus-visible, .site-search__close:focus-visible, .site-search__all:focus-visible { outline: 2px solid var(--color-accent-warm); outline-offset: 2px; }
.site-search__trigger svg, .site-search__field svg, .site-search__close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.7; }
.site-search__backdrop { position: fixed; z-index: 100; inset: 0; display: grid; padding: min(12vh, 96px) 18px 18px; color: var(--color-text); background: rgba(38, 50, 60, 0.34); backdrop-filter: blur(12px) saturate(0.82); place-items: start center; }
.site-search__backdrop[data-theme='nocturne'] { background: rgba(3, 8, 11, 0.72); }
.site-search__dialog { position: relative; width: min(100%, 680px); overflow: hidden; border: 1px solid var(--color-line); border-radius: 18px; color: var(--color-text); background: var(--color-panel-strong); box-shadow: 0 30px 90px rgba(var(--color-text-rgb), 0.22); }
.site-search__backdrop[data-theme='nocturne'] .site-search__dialog { box-shadow: 0 30px 90px rgba(0, 0, 0, 0.58); }
.site-search__dialog-head { display: flex; align-items: center; gap: 12px; padding: 14px; border-bottom: 1px solid var(--color-line); background: rgba(var(--color-panel-rgb), 0.34); }
.site-search__field { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; padding: 0 13px; border: 1px solid var(--color-line); border-radius: 11px; color: var(--color-muted); background: var(--color-field); transition: border-color 0.18s ease, box-shadow 0.18s ease; }
.site-search__field:focus-within { border-color: rgba(var(--color-accent-rgb), 0.64); box-shadow: 0 0 0 3px rgba(var(--color-accent-rgb), 0.1); color: var(--color-accent); }
.site-search__field input { width: 100%; min-width: 0; padding: 8px 0; border: 0; outline: 0; color: var(--color-text); background: transparent; font-size: 1rem; }
.site-search__field input::placeholder { color: var(--color-muted); opacity: 0.78; }
.site-search__close { display: grid; width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid var(--color-line); border-radius: 10px; color: var(--color-muted); background: rgba(var(--color-panel-rgb), 0.52); cursor: pointer; place-items: center; transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease; }
.site-search__close:hover { border-color: rgba(var(--color-accent-warm-rgb), 0.4); color: var(--color-accent-warm); background: rgba(var(--color-accent-warm-rgb), 0.08); }
.site-search__body { max-height: min(58vh, 460px); overflow-y: auto; padding: 10px; }
.site-search__status, .site-search__hint { margin: 0; padding: 22px 14px; color: var(--color-muted); text-align: center; }
.site-search__status--error { display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--color-accent-warm); }
.site-search__status--error button { border: 1px solid currentColor; border-radius: 7px; color: inherit; background: transparent; cursor: pointer; }
.site-search__results { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
.site-search__result { display: grid; gap: 4px; padding: 11px 12px; border-radius: 10px; color: var(--color-text); text-decoration: none; }
.site-search__result:hover { background: rgba(var(--color-accent-rgb), 0.08); }
.site-search__result strong { font-size: 0.94rem; }
.site-search__result span { overflow: hidden; color: var(--color-muted); font-size: 0.8rem; text-overflow: ellipsis; white-space: nowrap; }
.site-search__all { display: block; padding: 12px 18px; border-top: 1px solid var(--color-line); color: var(--color-accent); font-size: 0.82rem; font-weight: 750; text-align: center; text-decoration: none; }
@media (max-width: 720px) {
  .site-search__trigger { width: 32px; }
  .site-search__backdrop { padding: 10px; place-items: start center; }
  .site-search__dialog { margin-top: 52px; border-radius: 14px; }
}
</style>
