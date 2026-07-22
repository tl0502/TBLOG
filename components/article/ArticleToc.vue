<script setup lang="ts">
import type { TocItemView } from '~/types/public-view'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  items: TocItemView[]
}

defineProps<Props>()
const { t } = useTblogI18n()

// `navigate` lets a container (e.g. the mobile drawer) react to a heading jump,
// e.g. close itself. The native anchor still performs the in-page scroll.
const emit = defineEmits<{ navigate: [id: string] }>()
</script>

<template>
  <nav v-if="items.length" class="article-toc" :aria-label="t('article.toc')">
    <ul class="article-toc__list">
      <li
        v-for="item in items"
        :key="item.id"
        class="article-toc__item"
        :class="`article-toc__item--h${item.depth}`"
      >
        <a class="article-toc__link" :href="`#${item.id}`" @click="emit('navigate', item.id)">
          {{ item.text }}
        </a>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.article-toc__list {
  margin: 0;
  padding: 0 0 0 12px;
  border-left: 1px solid var(--color-line);
  list-style: none;
}

.article-toc__item--h3 {
  padding-inline-start: 12px;
}

.article-toc__link {
  position: relative;
  display: block;
  padding: 7px 8px 7px 11px;
  border-radius: 8px;
  color: var(--color-muted);
  font-size: 0.78rem;
  line-height: 1.4;
  text-decoration: none;
  transition: color 0.16s ease, background 0.16s ease;
}

.article-toc__link::before {
  position: absolute;
  top: 50%;
  left: -14px;
  width: 3px;
  height: 0;
  border-radius: 999px;
  background: var(--color-accent-warm);
  content: '';
  transform: translateY(-50%);
  transition: height 0.16s ease;
}

.article-toc__link:hover,
.article-toc__link:focus-visible {
  color: var(--color-accent);
  background: rgba(var(--color-accent-rgb), 0.07);
}

.article-toc__link:hover::before,
.article-toc__link:focus-visible::before {
  height: 18px;
}
</style>
