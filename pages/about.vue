<script setup lang="ts">
import { computed } from 'vue'
import { usePostDetail } from '~/composables/usePublicApi'
import { useBasicPageSeo } from '~/composables/useSeo'
import { isPublicNotFoundError } from '~/utils/public-errors'

const { data, error } = await usePostDetail('about')

if (error.value && isPublicNotFoundError(error.value)) {
  throw createError({ statusCode: 404, statusMessage: 'About page not found', fatal: true })
}
if (error.value && import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 503, 'About page temporarily unavailable')
}
if (error.value && import.meta.client && !useNuxtApp().isHydrating) {
  throw createError({ statusCode: 503, statusMessage: 'About page temporarily unavailable', fatal: true })
}
if (!error.value && !data.value?.data) {
  throw createError({ statusCode: 404, statusMessage: 'About page not found', fatal: true })
}

const post = computed(() => data.value?.data ?? null)

useBasicPageSeo({
  title: () => post.value?.seoTitle || post.value?.title,
  description: () => post.value?.seoDescription || post.value?.excerpt
})
</script>

<template>
  <article v-if="post" class="about">
    <h1 class="about__title">{{ post.title }}</h1>
    <!-- post.html is sanitized at processing time (rehype-sanitize); safe for v-html. -->
    <div class="about__prose prose" v-html="post.html" />
  </article>
</template>

<style scoped>
.about {
  width: min(100%, 720px);
  margin-inline: auto;
  padding: 32px 24px;
}

.about__title {
  margin: 0 0 18px;
  font-size: 1.8rem;
  font-weight: 780;
}

.about__prose {
  color: var(--color-text);
  line-height: 1.7;
}

.prose :deep(h2) {
  margin: 28px 0 10px;
  font-size: 1.3rem;
  font-weight: 760;
}

.prose :deep(h3) {
  margin: 22px 0 8px;
  font-size: 1.1rem;
  font-weight: 700;
}

.prose :deep(p) {
  margin: 0 0 14px;
}

.prose :deep(a) {
  color: var(--color-accent);
}

.prose :deep(ul),
.prose :deep(ol) {
  margin: 0 0 14px;
  padding-left: 1.4em;
}

.prose :deep(code) {
  padding: 1px 5px;
  border: 1px solid var(--color-line);
  border-radius: 6px;
  background: var(--color-page);
  font-size: 0.9em;
}

.prose :deep(pre) {
  margin: 0 0 16px;
  padding: 14px 16px;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  background: var(--color-page);
  overflow: auto;
}

.prose :deep(pre code) {
  padding: 0;
  border: 0;
  background: none;
}
</style>
