<script setup lang="ts">
import { computed } from 'vue'
import ArticleCard from '~/components/article/ArticleCard.vue'
import type { ArchiveGroupView } from '~/types/public-view'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  groups: ArchiveGroupView[]
}

const props = defineProps<Props>()
const { formatDate, t } = useTblogI18n()

const labeledGroups = computed(() =>
  props.groups.map((group) => ({
    key: `${group.year}-${group.month}`,
    label: formatDate(new Date(Date.UTC(group.year, group.month - 1, 1)), { year: 'numeric', month: 'long', timeZone: 'UTC' }),
    items: group.items
  }))
)
</script>

<template>
  <div class="container archive">
    <h1 class="archive__heading">{{ t('archive.title') }}</h1>

    <section v-for="group in labeledGroups" :key="group.key" class="archive__group">
      <h2 class="archive__period">{{ group.label }}</h2>
      <div class="archive__feed">
        <ArticleCard v-for="article in group.items" :key="article.id" :article="article" />
      </div>
    </section>

    <p v-if="!groups.length" class="archive__empty">{{ t('archive.empty') }}</p>
  </div>
</template>

<style scoped>
.archive {
  padding-block: 28px;
}

.archive__heading {
  margin: 0 0 20px;
  font-size: 1.5rem;
  font-weight: 780;
}

.archive__group {
  margin-bottom: 26px;
}

.archive__period {
  margin: 0 0 12px;
  color: var(--color-accent);
  font-size: 0.95rem;
  font-weight: 700;
}

.archive__feed {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.archive__empty {
  color: var(--color-muted);
}
</style>
