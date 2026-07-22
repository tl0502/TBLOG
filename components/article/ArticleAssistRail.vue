<script setup lang="ts">
import { computed } from 'vue'
import type { TagView, TocItemView } from '~/types/public-view'
import ArticleToc from '~/components/article/ArticleToc.vue'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  toc: TocItemView[]
  publishedAt: string
  readingTime: number
  tags: TagView[]
  open: boolean
}

const props = defineProps<Props>()
const { formatDate, t } = useTblogI18n()
const publishedDate = computed(() => formatDate(props.publishedAt))
</script>

<template>
  <aside
    id="article-assist-rail"
    class="assist-rail"
    :class="{ 'assist-rail--open': props.open }"
    :aria-label="t('article.details')"
  >
    <div class="assist-rail__top">
      <p class="assist-rail__eyebrow">{{ t('article.context') }}</p>
      <div class="assist-rail__meta">
        <div class="assist-rail__meta-item">
          <span>{{ t('article.published') }}</span>
          <time :datetime="props.publishedAt">{{ publishedDate }}</time>
        </div>
        <div class="assist-rail__meta-item">
          <span>{{ t('article.reading') }}</span>
          <strong>{{ t('common.minutesRead', { count: props.readingTime }) }}</strong>
        </div>
      </div>
    </div>

    <div class="assist-rail__body">
      <div class="assist-rail__toc">
        <p class="assist-rail__heading">{{ t('article.onThisPage') }}</p>
        <ArticleToc :items="props.toc" />
        <p v-if="!props.toc.length" class="assist-rail__empty">{{ t('article.noHeadings') }}</p>
      </div>

      <ul v-if="props.tags.length" class="assist-rail__tags">
        <li v-for="tag in props.tags" :key="tag.slug">
          <NuxtLink class="assist-rail__tag" :to="`/tags/${tag.slug}`">{{ tag.name }}</NuxtLink>
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
.assist-rail {
  position: sticky;
  top: 92px;
  width: 100%;
  max-height: calc(100vh - 116px);
  overflow: auto;
  border: 1px solid rgba(var(--color-accent-rgb), 0.18);
  border-radius: 18px;
  background: rgba(var(--color-panel-rgb), 0.64);
  box-shadow: var(--shadow-card);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateX(28px) scale(0.985);
  transform-origin: right center;
  transition:
    opacity 0.22s ease,
    visibility 0.22s ease,
    transform 0.26s cubic-bezier(0.2, 0.7, 0.2, 1);
  backdrop-filter: blur(18px) saturate(1.12);
  -webkit-backdrop-filter: blur(18px) saturate(1.12);
  scrollbar-color: transparent transparent;
  scrollbar-width: thin;
}

.assist-rail:hover,
.assist-rail:focus-within {
  scrollbar-color: rgba(var(--color-accent-rgb), 0.24) transparent;
}

.assist-rail::-webkit-scrollbar {
  width: 5px;
}

.assist-rail::-webkit-scrollbar-track {
  margin-block: 12px;
  background: transparent;
}

.assist-rail::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: transparent;
  transition: background 0.18s ease;
}

.assist-rail:hover::-webkit-scrollbar-thumb,
.assist-rail:focus-within::-webkit-scrollbar-thumb {
  background: rgba(var(--color-accent-rgb), 0.24);
}

.assist-rail::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--color-accent-rgb), 0.42);
}

.assist-rail--open {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: translateX(0) scale(1);
}

.assist-rail__top {
  padding: 18px 18px 15px;
  border-bottom: 1px solid var(--color-line);
}

.assist-rail__eyebrow {
  margin: 0 0 10px;
  color: var(--color-accent-warm);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.assist-rail__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.assist-rail__meta-item {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid rgba(var(--color-accent-rgb), 0.11);
  border-radius: 11px;
  background: rgba(var(--color-panel-rgb), 0.34);
}

.assist-rail__meta-item span,
.assist-rail__meta-item time,
.assist-rail__meta-item strong {
  display: block;
}

.assist-rail__meta-item span {
  color: var(--color-muted);
  font-size: 0.61rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.assist-rail__meta-item time,
.assist-rail__meta-item strong {
  margin-top: 2px;
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 0.72rem;
  font-weight: 700;
}

.assist-rail__body {
  padding: 17px 18px 18px;
}

.assist-rail__heading {
  margin: 0 0 12px;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 650;
}

.assist-rail__empty {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.assist-rail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 16px 0 0;
  padding: 15px 0 0;
  border-top: 1px solid var(--color-line);
  list-style: none;
}

.assist-rail__tag {
  display: inline-flex;
  border: 1px solid var(--color-line);
  background: rgba(var(--color-panel-rgb), 0.28);
  color: var(--color-muted);
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 0.68rem;
  font-weight: 600;
  text-decoration: none;
}

.assist-rail__tag:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}
</style>
