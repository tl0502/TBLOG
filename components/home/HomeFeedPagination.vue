<script setup lang="ts">
import { computed } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'
import type { HomeFeedSort, SortOrder } from '~/types/home-feed'

const props = defineProps<{
  page: number
  pageCount: number
  sort: HomeFeedSort
  order: SortOrder
}>()

const { t } = useTblogI18n()
const currentPage = computed(() => props.page)

const items = computed(() => {
  const pages = new Set<number>([1, props.pageCount])
  for (let page = currentPage.value - 1; page <= currentPage.value + 1; page += 1) {
    if (page > 1 && page < props.pageCount) pages.add(page)
  }
  if (props.pageCount <= 7) {
    for (let page = 1; page <= props.pageCount; page += 1) pages.add(page)
  }
  const sorted = [...pages].filter((page) => page > 0).sort((a, b) => a - b)
  const result: Array<{ key: string; page?: number }> = []
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1]
    if (previous !== undefined && page - previous > 1) result.push({ key: `gap-${previous}` })
    result.push({ key: `page-${page}`, page })
  })
  return result
})

function location(page: number) {
  return { path: '/', query: { sort: props.sort, order: props.order, page: String(page) }, hash: '#articles' }
}
</script>

<template>
  <nav v-if="pageCount > 1" class="home-feed-pagination" :aria-label="t('home.pagination')">
    <NuxtLink v-if="currentPage > 1" class="home-feed-pagination__step" :to="location(currentPage - 1)">
      <span aria-hidden="true">←</span>{{ t('home.previousPage') }}
    </NuxtLink>
    <span v-else class="home-feed-pagination__step is-disabled"><span aria-hidden="true">←</span>{{ t('home.previousPage') }}</span>

    <div class="home-feed-pagination__pages">
      <template v-for="item in items" :key="item.key">
        <span v-if="item.page === undefined" class="home-feed-pagination__ellipsis" aria-hidden="true">…</span>
        <NuxtLink
          v-else
          :to="location(item.page)"
          :class="{ 'is-active': item.page === currentPage }"
          :aria-current="item.page === currentPage ? 'page' : undefined"
          :aria-label="t('home.pageNumber', { page: item.page })"
        >{{ item.page }}</NuxtLink>
      </template>
    </div>

    <NuxtLink v-if="currentPage < pageCount" class="home-feed-pagination__step" :to="location(currentPage + 1)">
      {{ t('home.nextPage') }}<span aria-hidden="true">→</span>
    </NuxtLink>
    <span v-else class="home-feed-pagination__step is-disabled">{{ t('home.nextPage') }}<span aria-hidden="true">→</span></span>
  </nav>
</template>

<style scoped>
.home-feed-pagination {
  display: flex;
  margin-top: 12px;
  padding-top: 20px;
  border-top: 1px solid var(--color-line);
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.home-feed-pagination a,
.home-feed-pagination__step,
.home-feed-pagination__ellipsis {
  color: var(--color-muted);
  font-size: 0.76rem;
  text-decoration: none;
}

.home-feed-pagination__step {
  display: inline-flex;
  min-width: 84px;
  align-items: center;
  gap: 7px;
  font-weight: 700;
}

.home-feed-pagination__step:last-child {
  justify-content: flex-end;
}

.home-feed-pagination__step.is-disabled {
  opacity: 0.3;
}

.home-feed-pagination__pages {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.home-feed-pagination__pages a,
.home-feed-pagination__ellipsis {
  display: grid;
  width: 31px;
  height: 31px;
  border-radius: 8px;
  place-items: center;
}

.home-feed-pagination__pages a:hover,
.home-feed-pagination__pages a:focus-visible {
  color: var(--color-text);
  background: rgba(var(--color-accent-rgb), 0.08);
}

.home-feed-pagination__pages a.is-active {
  color: #fff;
  background: var(--color-accent);
  box-shadow: 0 7px 18px rgba(var(--color-accent-rgb), 0.24);
}

.home-feed-pagination > a:hover,
.home-feed-pagination > a:focus-visible {
  color: var(--color-accent);
}

@media (max-width: 520px) {
  .home-feed-pagination {
    gap: 8px;
  }

  .home-feed-pagination__step {
    min-width: 34px;
    font-size: 0;
  }

  .home-feed-pagination__step span {
    font-size: 0.9rem;
  }

  .home-feed-pagination__pages a,
  .home-feed-pagination__ellipsis {
    width: 28px;
    height: 28px;
  }

  .home-feed-pagination__ellipsis {
    display: none;
  }
}
</style>
