<script setup lang="ts">
import { computed } from 'vue'
import type { ArticleListItemView } from '~/types/public-view'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { usePublicImages } from '~/composables/usePublicImages'

interface Props {
  article: ArticleListItemView
}

const props = defineProps<Props>()
const { formatDate, t } = useTblogI18n()
const publishedDate = computed(() => formatDate(props.article.publishedAt))
const images = usePublicImages()
const thumbnail = computed(() => props.article.cover ? images.variant(props.article.cover, 'thumbnail') : null)
const thumbnailSrcset = computed(() => props.article.cover ? images.srcset(props.article.cover) : null)
const visibleTags = computed(() => props.article.tags.slice(0, 2))
const hiddenTags = computed(() => props.article.tags.slice(2))
const placeholderLetter = computed(() => Array.from(props.article.title.trim())[0]?.toUpperCase() || 'T')
</script>

<template>
  <article
    class="article-card"
    :class="thumbnail ? 'article-card--with-cover' : 'article-card--without-cover'"
  >
    <NuxtLink class="article-card__media" :to="`/posts/${article.slug}`" tabindex="-1" aria-hidden="true">
      <img
        v-if="thumbnail"
        class="article-card__image"
        :src="thumbnail"
        :srcset="thumbnailSrcset ?? undefined"
        sizes="(max-width: 560px) 100vw, 240px"
        alt=""
        loading="lazy"
        decoding="async"
      >
      <span v-else class="article-card__placeholder" aria-hidden="true">{{ placeholderLetter }}</span>
    </NuxtLink>
    <div class="article-card__body">
      <h2 class="article-card__title">
        <NuxtLink class="article-card__title-link" :to="`/posts/${article.slug}`">
          {{ article.title }}
        </NuxtLink>
      </h2>

      <p v-if="article.excerpt" class="article-card__excerpt">{{ article.excerpt }}</p>

      <ul v-if="article.tags.length" class="article-card__tags">
        <li v-for="tag in visibleTags" :key="tag.slug">
          <NuxtLink class="article-card__tag" :to="`/tags/${tag.slug}`">{{ tag.name }}</NuxtLink>
        </li>
        <li v-if="hiddenTags.length" class="article-card__tag-overflow">
          <span
            class="article-card__tag-more"
            :title="hiddenTags.map(tag => tag.name).join('、')"
            :aria-label="hiddenTags.map(tag => tag.name).join('、')"
          >+{{ hiddenTags.length }}</span>
        </li>
      </ul>
    </div>

    <div class="article-card__meta">
      <time :datetime="article.publishedAt">{{ publishedDate }}</time>
      <span>{{ t('common.minutesRead', { count: article.readingTime }) }}</span>
    </div>
  </article>
</template>

<style scoped>
.article-card {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr) auto;
  gap: 18px;
  height: 178px;
  padding: 18px 20px;
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-panel);
  box-shadow: var(--shadow-card);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

/* Primary feed cards: modest lift, no whole-card scale; fine-pointer only. */
@media (hover: hover) and (pointer: fine) {
  .article-card:hover {
    border-color: rgba(var(--color-accent-rgb), 0.42);
    transform: translateY(-3px);
    box-shadow: var(--shadow-card-hover);
  }

  .article-card:hover .article-card__image {
    transform: scale(1.03);
  }

  .article-card:hover .article-card__placeholder {
    border-color: rgba(var(--color-accent-rgb), 0.55);
    transform: scale(1.04);
  }
}

.article-card__media {
  grid-column: 1;
  grid-row: 1;
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-radius: 12px;
  place-items: center;
  background:
    radial-gradient(circle at 72% 24%, rgba(var(--color-accent-warm-rgb), 0.16), transparent 34%),
    linear-gradient(145deg, rgba(var(--color-accent-rgb), 0.16), rgba(var(--color-panel-rgb), 0.94));
}

.article-card__placeholder {
  display: grid;
  width: 52px;
  height: 52px;
  border: 1px solid rgba(var(--color-accent-rgb), 0.3);
  border-radius: 50%;
  color: var(--color-accent);
  font: 650 1.55rem/1 var(--font-display);
  place-items: center;
  background: rgba(var(--color-panel-rgb), 0.5);
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.article-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s ease;
}

.article-card__body {
  grid-column: 2;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.article-card__title {
  display: -webkit-box;
  height: 3.12rem;
  margin: 0;
  overflow: hidden;
  font-family: var(--font-display);
  font-size: 1.22rem;
  font-weight: 650;
  line-height: 1.28;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.article-card__title-link {
  color: var(--color-text);
  text-decoration: none;
  overflow-wrap: anywhere;
}

.article-card__title-link:hover {
  color: var(--color-accent);
}

.article-card__excerpt {
  display: -webkit-box;
  margin: 7px 0 0;
  overflow: hidden;
  color: var(--color-muted);
  font-size: 0.84rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.article-card__tags {
  display: flex;
  height: 25px;
  min-width: 0;
  align-items: center;
  flex-wrap: nowrap;
  gap: 5px;
  margin: auto 0 0;
  padding: 0;
  list-style: none;
}

.article-card__tags > li {
  min-width: 0;
  line-height: 0;
}

.article-card__tag-overflow {
  flex: 0 0 auto;
}

.article-card__tag,
.article-card__tag-more {
  display: inline-block;
  padding: 3px 9px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  color: var(--color-muted);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  background: var(--color-page);
}

.article-card__tag {
  max-width: clamp(72px, 8vw, 112px);
  overflow: hidden;
  text-decoration: none;
  text-overflow: ellipsis;
}

.article-card__tag-more {
  color: var(--color-accent);
}

.article-card__tag:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.article-card__meta {
  grid-column: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  color: var(--color-muted);
  font-size: 0.8rem;
  white-space: nowrap;
  text-align: right;
}

@media (max-width: 560px) {
  .article-card {
    grid-template-columns: 1fr;
    height: auto;
    padding: 18px;
  }

  .article-card__media {
    grid-column: auto;
    grid-row: auto;
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
  }

  .article-card__body,
  .article-card__meta { grid-column: auto; }

  .article-card__title {
    height: auto;
  }

  .article-card__tags {
    margin-top: 12px;
  }

  .article-card__meta {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
}
</style>
