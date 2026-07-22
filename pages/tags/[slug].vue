<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import type { ArticleListItemView } from '~/types/public-view'
import TaxonomyDetail from '~/components/taxonomy/TaxonomyDetail.vue'
import { fetchTagDetail, useTagDetail } from '~/composables/usePublicApi'
import { useBasicPageSeo } from '~/composables/useSeo'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { isPublicNotFoundError } from '~/utils/public-errors'

const route = useRoute()
definePageMeta({ key: route => route.fullPath })
const slug = computed(() => String(route.params.slug))

const { data, error } = await useTagDetail(slug)

if (error.value && isPublicNotFoundError(error.value)) {
  throw createError({ statusCode: 404, statusMessage: 'Tag not found', fatal: true })
}
if (error.value && import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 503, 'Tag temporarily unavailable')
}
if (error.value && import.meta.client && !useNuxtApp().isHydrating) {
  throw createError({ statusCode: 503, statusMessage: 'Tag temporarily unavailable', fatal: true })
}
if (!error.value && !data.value?.data) {
  throw createError({ statusCode: 404, statusMessage: 'Tag not found', fatal: true })
}

const detail = computed(() => data.value?.data ?? null)
const { t } = useTblogI18n()
const initialArticles = data.value?.data.items ?? []
const articles = shallowRef<ArticleListItemView[]>([...initialArticles])
const articleIds = new Set(initialArticles.map((article) => article.id))
let activeSlug = slug.value
let hasPaginated = false
let listGeneration = 0
const nextCursor = shallowRef(data.value?.meta.nextCursor ?? null)
const loadingMore = shallowRef(false)
const loadError = shallowRef('')

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  const slugAtStart = slug.value
  const cursorAtStart = nextCursor.value
  const generationAtStart = listGeneration
  loadingMore.value = true
  loadError.value = ''
  try {
    const response = await fetchTagDetail(slugAtStart, { cursor: cursorAtStart })
    if (
      slug.value !== slugAtStart
      || response.data.tag.slug !== slugAtStart
      || listGeneration !== generationAtStart
    ) return
    const appended = response.data.items.filter((article) => {
      if (articleIds.has(article.id)) return false
      articleIds.add(article.id)
      return true
    })
    if (appended.length) {
      articles.value = [...articles.value, ...appended]
    }
    hasPaginated = true
    nextCursor.value = response.meta.nextCursor
  } catch {
    if (slug.value === slugAtStart && listGeneration === generationAtStart) {
      loadError.value = t('taxonomy.loadMoreError')
    }
  } finally {
    loadingMore.value = false
  }
}

watch([slug, data], ([currentSlug, response]) => {
  const identityChanged = activeSlug !== currentSlug
  if (identityChanged) {
    activeSlug = currentSlug
    hasPaginated = false
    listGeneration += 1
  }

  if (response?.data?.tag.slug !== currentSlug) {
    if (identityChanged) {
      articleIds.clear()
      articles.value = []
      nextCursor.value = null
      loadError.value = ''
    }
    return
  }

  // A same-resource stale-first revalidation must not discard pages already appended by loadMore.
  if (hasPaginated) return

  if (!identityChanged) listGeneration += 1

  const nextArticles = response.data.items
  articleIds.clear()
  nextArticles.forEach((article) => articleIds.add(article.id))
  articles.value = [...nextArticles]
  nextCursor.value = response.meta.nextCursor ?? null
  loadError.value = ''
})

useBasicPageSeo({
  title: () => detail.value?.tag.name,
  description: () => detail.value?.tag.description
})
</script>

<template>
  <TaxonomyDetail
    v-if="detail"
    :kind="t('nav.tags')"
    :name="detail.tag.name"
    :description="detail.tag.description"
    :articles="articles"
    :has-more="nextCursor !== null"
    :loading-more="loadingMore"
    :load-error="loadError"
    @load-more="loadMore"
  />
</template>
