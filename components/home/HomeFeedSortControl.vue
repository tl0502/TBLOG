<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'
import type { HomeFeedSort, SortOrder } from '~/types/home-feed'

const props = defineProps<{
  sort: HomeFeedSort
  order: SortOrder
  statisticsAvailable?: boolean
}>()

const { t } = useTblogI18n()
const root = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const menuId = `home-feed-sort-${useId()}`
const options: HomeFeedSort[] = ['pageViews', 'publishedAt', 'updatedAt']

function label(sort: HomeFeedSort): string {
  if (sort === 'pageViews') return t('home.sortPageViews')
  if (sort === 'updatedAt') return t('home.sortUpdatedAt')
  return t('home.sortPublishedAt')
}

const selectedLabel = computed(() => label(props.sort))

function location(sort: HomeFeedSort, order: SortOrder) {
  return { path: '/', query: { sort, order, page: '1' }, hash: '#articles' }
}

function closeMenu() {
  menuOpen.value = false
}

function handleOutsidePointer(event: PointerEvent) {
  if (menuOpen.value && !root.value?.contains(event.target as Node)) closeMenu()
}

function handleFocusOut(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) closeMenu()
}

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleOutsidePointer))
</script>

<template>
  <div
    ref="root"
    class="home-feed-sort"
    :class="{ 'is-open': menuOpen }"
    :aria-label="t('home.sortLabel')"
    @focusout="handleFocusOut"
    @keydown.esc="closeMenu"
  >
    <button
      class="home-feed-sort__trigger"
      type="button"
      aria-haspopup="menu"
      :aria-controls="menuId"
      :aria-expanded="menuOpen"
      @click="menuOpen = !menuOpen"
    >
      <span>{{ selectedLabel }}</span>
    </button>
    <div :id="menuId" class="home-feed-sort__menu" role="menu">
      <template v-for="option in options" :key="option">
        <NuxtLink
          v-if="option !== 'pageViews' || statisticsAvailable"
          :to="location(option, order)"
          :class="{ 'is-active': option === sort }"
          :aria-current="option === sort ? 'true' : undefined"
          role="menuitem"
          @click="closeMenu"
        >
          {{ label(option) }}
        </NuxtLink>
      </template>
      <span v-if="!statisticsAvailable" class="home-feed-sort__disabled" role="menuitem" aria-disabled="true">
        {{ label('pageViews') }}
      </span>
    </div>

    <NuxtLink
      class="home-feed-sort__direction-toggle"
      :to="location(sort, order === 'asc' ? 'desc' : 'asc')"
      :aria-label="order === 'asc'
        ? t('home.sortDescending', { metric: selectedLabel })
        : t('home.sortAscending', { metric: selectedLabel })"
    >
      <span :class="{ 'is-active': order === 'asc' }" aria-hidden="true">↑</span>
      <span :class="{ 'is-active': order === 'desc' }" aria-hidden="true">↓</span>
    </NuxtLink>
  </div>
</template>

<style scoped>
.home-feed-sort {
  position: relative;
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  gap: 7px;
}

.home-feed-sort__trigger {
  display: inline-flex;
  min-height: 24px;
  padding: 1px 0;
  border: 0;
  align-items: center;
  color: var(--color-muted);
  background: transparent;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
  transition: color 0.16s ease;
}

.home-feed-sort__trigger:hover,
.home-feed-sort__trigger:focus-visible,
.home-feed-sort.is-open > .home-feed-sort__trigger {
  color: var(--color-text);
}

.home-feed-sort__trigger:focus-visible,
.home-feed-sort__direction-toggle:focus-visible {
  outline: 2px solid rgba(var(--color-accent-rgb), 0.42);
  outline-offset: 3px;
}

.home-feed-sort__menu {
  position: absolute;
  top: calc(100% + 7px);
  left: 0;
  z-index: 12;
  display: grid;
  min-width: 138px;
  padding: 6px;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  background: var(--color-panel);
  box-shadow: 0 18px 42px rgba(var(--color-text-rgb), 0.14);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 0.16s ease, transform 0.16s ease, visibility 0.16s ease;
}

.home-feed-sort__menu::before {
  position: absolute;
  right: 0;
  bottom: 100%;
  left: 0;
  height: 8px;
  content: '';
}

.home-feed-sort__trigger:hover + .home-feed-sort__menu,
.home-feed-sort__trigger:focus-visible + .home-feed-sort__menu,
.home-feed-sort__menu:hover,
.home-feed-sort__menu:focus-within,
.home-feed-sort.is-open .home-feed-sort__menu {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.home-feed-sort__menu a {
  padding: 8px 10px;
  border-radius: 7px;
  color: var(--color-muted);
  font-size: 0.74rem;
  text-decoration: none;
  white-space: nowrap;
}

.home-feed-sort__disabled {
  padding: 8px 10px;
  color: var(--color-muted);
  font-size: 0.74rem;
  opacity: 0.45;
}

.home-feed-sort__menu a:hover,
.home-feed-sort__menu a:focus-visible,
.home-feed-sort__menu a.is-active {
  color: var(--color-text);
  background: rgba(var(--color-accent-rgb), 0.1);
}

.home-feed-sort__direction-toggle {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  gap: 0;
  color: var(--color-accent);
  font: 700 0.82rem/1 Arial, sans-serif;
  text-decoration: none;
  transition: transform 0.16s ease;
}

.home-feed-sort__direction-toggle:hover,
.home-feed-sort__direction-toggle:focus-visible {
  transform: translateY(-1px);
}

.home-feed-sort__direction-toggle span {
  display: inline-grid;
  width: 11px;
  opacity: 0.28;
  place-items: center;
  transition: opacity 0.16s ease;
}

.home-feed-sort__direction-toggle span + span {
  margin-left: -2px;
}

.home-feed-sort__direction-toggle:hover span {
  opacity: 0.55;
}

.home-feed-sort__direction-toggle span.is-active,
.home-feed-sort__direction-toggle:hover span.is-active {
  opacity: 1;
}
</style>
