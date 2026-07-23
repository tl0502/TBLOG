<script setup lang="ts">
import type { TaxonomyView } from '~/types/public-view'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  heading: string
  items: TaxonomyView[]
  basePath: string
}

defineProps<Props>()
const { t } = useTblogI18n()
</script>

<template>
  <div class="container taxonomy-list">
    <h1 class="taxonomy-list__heading">{{ heading }}</h1>

    <ul v-if="items.length" class="taxonomy-list__grid">
      <li v-for="item in items" :key="item.slug">
        <NuxtLink class="taxonomy-list__card" :to="`${basePath}/${item.slug}`">
          <span class="taxonomy-list__top">
            <span class="taxonomy-list__name">{{ item.name }}</span>
            <span class="taxonomy-list__count">{{ item.articleCount }}</span>
          </span>
          <span v-if="item.description" class="taxonomy-list__desc">{{ item.description }}</span>
        </NuxtLink>
      </li>
    </ul>

    <p v-else class="taxonomy-list__empty">{{ t('taxonomy.empty') }}</p>
  </div>
</template>

<style scoped>
.taxonomy-list {
  padding-block: 28px;
}

.taxonomy-list__heading {
  margin: 0 0 18px;
  font-size: 1.5rem;
  font-weight: 780;
}

.taxonomy-list__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.taxonomy-list__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 16px 18px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-panel);
  box-shadow: var(--shadow-card);
  text-decoration: none;
  color: var(--color-text);
  transition: box-shadow 0.16s ease, border-color 0.16s ease;
}

@media (hover: hover) and (pointer: fine) {
  .taxonomy-list__card:hover {
    border-color: rgba(var(--color-accent-rgb), 0.28);
    box-shadow: var(--shadow-card-hover);
  }
}

.taxonomy-list__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.taxonomy-list__name {
  font-size: 1.05rem;
  font-weight: 700;
}

.taxonomy-list__count {
  color: var(--color-muted);
  font-size: 0.8rem;
  font-weight: 600;
}

.taxonomy-list__desc {
  color: var(--color-muted);
  font-size: 0.85rem;
  line-height: 1.55;
}

.taxonomy-list__empty {
  color: var(--color-muted);
}
</style>
