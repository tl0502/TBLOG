<script setup lang="ts">
import type { PostDetailView } from '~/types/public-view'
defineProps<{
  post: PostDetailView
  publishedDate: string
  coverUrl: string | null
  coverSrcset: string | null
  pageViews?: number | null
}>()
</script>

<template>
  <header class="article-hero" :class="{ 'article-hero--with-cover': coverUrl }">
    <img
      v-if="coverUrl"
      class="article-hero__image"
      :src="coverUrl"
      :srcset="coverSrcset ?? undefined"
      sizes="(max-width: 1179px) calc(100vw - 48px), 1120px"
      alt=""
      decoding="async"
      fetchpriority="high"
    >
    <div class="article-hero__shade" aria-hidden="true" />
    <div class="article-hero__content">
      <p class="article-hero__eyebrow">{{ post.type === 'article' ? 'Article' : 'Page' }}</p>
      <h1 class="article-hero__title">{{ post.title }}</h1>
      <div class="article-hero__meta">
        <time :datetime="post.publishedAt">{{ publishedDate }}</time>
        <span>{{ post.readingTime }} min read</span>
        <span v-if="pageViews !== null && pageViews !== undefined">{{ pageViews.toLocaleString() }} PV</span>
        <NuxtLink
          v-if="post.category"
          class="article-hero__category"
          :to="`/categories/${post.category.slug}`"
        >
          <span class="article-hero__category-mark" aria-hidden="true">○</span>
          {{ post.category.name }}
        </NuxtLink>
        <NuxtLink
          v-for="tag in post.tags"
          :key="tag.slug"
          class="article-hero__tag"
          :to="`/tags/${tag.slug}`"
        >
          #{{ tag.name }}
        </NuxtLink>
      </div>
    </div>
  </header>
</template>

<style scoped>
.article-hero {
  position: relative;
  display: flex;
  min-height: clamp(360px, 48vw, 540px);
  overflow: hidden;
  margin-bottom: 38px;
  border: 1px solid var(--color-line);
  border-radius: 24px;
  color: var(--color-text);
  background: linear-gradient(145deg, rgba(var(--color-accent-rgb), .16), rgba(var(--color-panel-rgb), .98));
  box-shadow: var(--shadow-card);
  align-items: flex-end;
}

.article-hero__image,
.article-hero__shade {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.article-hero__image { object-fit: cover; }
.article-hero__shade { background: linear-gradient(180deg, rgba(10, 15, 18, .08) 10%, rgba(10, 15, 18, .38) 52%, rgba(10, 15, 18, .9) 100%); }
.article-hero:not(.article-hero--with-cover) .article-hero__shade { opacity: 0; }
.article-hero--with-cover { border-color: transparent; color: #fff; }

.article-hero__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-self: stretch;
  width: 100%;
  padding: clamp(28px, 5vw, 58px);
  text-align: center;
}

.article-hero__eyebrow { position: absolute; top: clamp(24px, 4vw, 42px); left: clamp(24px, 4vw, 42px); margin: 0; color: inherit; font-size: .7rem; font-weight: 800; letter-spacing: .14em; opacity: .76; text-align: left; text-transform: uppercase; }
.article-hero__title { max-width: 13em; margin: 0 auto; color: inherit; font-family: var(--font-display); font-size: clamp(2.7rem, 5.5vw, 5.15rem); font-weight: 650; letter-spacing: -.045em; line-height: 1.04; overflow-wrap: anywhere; text-wrap: balance; }
.article-hero__meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px 18px; color: inherit; font-size: .88rem; }
.article-hero__meta { margin-top: 24px; opacity: .76; }
.article-hero a { color: inherit; text-decoration: none; }
.article-hero__category { font-weight: 700; opacity: .9; }
.article-hero__category-mark { display: inline-block; font-size: .72em; transform: translateY(-.04em); }
.article-hero__tag { opacity: .82; }
.article-hero__category:hover,
.article-hero__tag:hover { opacity: 1; }

@media (max-width: 640px) {
  .article-hero { min-height: 390px; margin-bottom: 30px; border-radius: 18px; }
  .article-hero__content { padding: 26px 22px; }
  .article-hero__eyebrow { top: 22px; left: 22px; }
  .article-hero__title { font-size: clamp(2.35rem, 11.5vw, 3.7rem); text-wrap: wrap; }
  .article-hero__meta { gap: 8px 13px; margin-top: 20px; font-size: .8rem; }
}
</style>
