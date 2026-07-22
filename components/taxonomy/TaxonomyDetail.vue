<script setup lang="ts">
import ArticleCard from '~/components/article/ArticleCard.vue'
import type { ArticleListItemView } from '~/types/public-view'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  kind: string
  name: string
  description?: string | null
  articles: ArticleListItemView[]
  hasMore?: boolean
  loadingMore?: boolean
  loadError?: string
}

withDefaults(defineProps<Props>(), {
  description: null,
  hasMore: false,
  loadingMore: false,
  loadError: ''
})
const emit = defineEmits<{ loadMore: [] }>()
const { t } = useTblogI18n()
</script>

<template>
  <div class="container taxonomy-detail">
    <header class="taxonomy-detail__head">
      <p class="taxonomy-detail__eyebrow">{{ kind }}</p>
      <h1 class="taxonomy-detail__title">{{ name }}</h1>
      <p v-if="description" class="taxonomy-detail__desc">{{ description }}</p>
    </header>

    <div class="taxonomy-detail__feed">
      <ArticleCard v-for="article in articles" :key="article.id" :article="article" />
      <p v-if="!articles.length" class="taxonomy-detail__empty">
        {{ t('taxonomy.noArticles', { kind: kind.toLowerCase() }) }}
      </p>
      <p v-if="loadError" class="taxonomy-detail__error" role="alert">{{ loadError }}</p>
      <button
        v-if="hasMore"
        type="button"
        class="taxonomy-detail__more"
        :disabled="loadingMore"
        @click="emit('loadMore')"
      >
        {{ loadingMore ? t('common.loading') : t('taxonomy.loadMore') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.taxonomy-detail {
  padding-block: 28px;
}

.taxonomy-detail__head {
  margin-bottom: 20px;
}

.taxonomy-detail__eyebrow {
  margin: 0 0 6px;
  color: var(--color-accent);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.taxonomy-detail__title {
  margin: 0 0 8px;
  font-size: 1.6rem;
  font-weight: 780;
}

.taxonomy-detail__desc {
  margin: 0;
  color: var(--color-muted);
  line-height: 1.6;
}

.taxonomy-detail__feed {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.taxonomy-detail__empty {
  color: var(--color-muted);
}

.taxonomy-detail__error {
  margin: 0;
  color: var(--color-accent-warm);
}

.taxonomy-detail__more {
  align-self: center;
  min-width: 132px;
  padding: 9px 18px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-panel);
  color: var(--color-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.taxonomy-detail__more:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
