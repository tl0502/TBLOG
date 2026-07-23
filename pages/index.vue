<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import HomeView from '~/components/home/HomeView.vue'
import { prefetchPostFeed, useHomeShell, usePostFeed } from '~/composables/usePublicApi'
import { useOptionalPublicSiteConfigData } from '~/composables/useSiteConfig'
import { useHomeSeo } from '~/composables/useSeo'
import { HOME_FEED_PAGE_SIZE, homeFeedSortValues, sortOrderValues, type HomeFeedSort, type SortOrder } from '~/types/home-feed'
import { resolvedHomePageReplacement } from '~/utils/home-feed-navigation'

// Stable page key: pagination/sort only revalidates the feed resource, not the whole page shell.
definePageMeta({ key: 'home' })

const route = useRoute()

function queryValue(value: unknown): string | undefined {
  return Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : undefined
}

const feedQuery = computed(() => {
  const sortValue = queryValue(route.query.sort)
  const orderValue = queryValue(route.query.order)
  const pageValue = Number(queryValue(route.query.page))
  return {
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
    limit: HOME_FEED_PAGE_SIZE,
    sort: homeFeedSortValues.includes(sortValue as HomeFeedSort) ? sortValue as HomeFeedSort : 'publishedAt',
    order: sortOrderValues.includes(orderValue as SortOrder) ? orderValue as SortOrder : 'desc'
  }
})

const siteConfig = useOptionalPublicSiteConfigData()
// Shell skips feed D1; list is always `/api/v1/posts` so page/sort never doubles the article query.
const [
  { data: bootstrap, error: shellError },
  { data: feedPage, error: feedError }
] = await Promise.all([
  useHomeShell(),
  usePostFeed(feedQuery)
])

if (shellError.value && import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 503, 'Homepage temporarily unavailable')
}
if (feedError.value && import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 503, 'Homepage temporarily unavailable')
}
// Shell failure is fatal on the client; a feed-only failure keeps the chrome and empty/stale list.
if (shellError.value && import.meta.client && !useNuxtApp().isHydrating) {
  throw createError({ statusCode: 503, statusMessage: 'Homepage temporarily unavailable', fatal: true })
}

const feedItems = computed(() => feedPage.value?.data ?? [])
const feedMeta = computed(() => feedPage.value?.meta ?? ({
  ...feedQuery.value,
  pageSize: HOME_FEED_PAGE_SIZE,
  total: 0,
  pageCount: 0
}))
const featured = computed(() => bootstrap.value?.data.featured ?? [])
const tags = computed(() => (bootstrap.value?.data.tags ?? []).map((tag) => ({ slug: tag.slug, name: tag.name })))
const profile = computed(() => siteConfig.value?.data.profile ?? null)
const hotspots = computed(() => bootstrap.value?.data.hotspots ?? null)
const railData = computed(() => bootstrap.value?.data.homeRail ?? null)

watch(() => feedPage.value?.meta, (meta) => {
  if (!meta) return
  if (import.meta.client && meta.effectiveSort && meta.effectiveSort !== feedQuery.value.sort) {
    void navigateTo({
      path: '/',
      query: { sort: meta.effectiveSort, order: 'desc', page: String(meta.page) },
      hash: '#articles'
    }, { replace: true })
    return
  }
  const page = resolvedHomePageReplacement(
    meta.page,
    feedQuery.value.page,
    meta.pageCount
  )
  if (import.meta.server || page === null) return
  void navigateTo({
    path: '/',
    query: { sort: feedQuery.value.sort, order: feedQuery.value.order, page: String(page) },
    hash: '#articles'
  }, { replace: true })
}, { immediate: !import.meta.server })

function warmAdjacentFeedPages() {
  if (!import.meta.client) return
  const meta = feedMeta.value
  const query = feedQuery.value
  const pageCount = meta.pageCount ?? 0
  if (pageCount <= 1) return
  const neighbors = [query.page - 1, query.page + 1].filter((page) => page >= 1 && page <= pageCount)
  for (const page of neighbors) {
    void prefetchPostFeed({ ...query, page })
  }
}

// After first paint / each feed settlement, warm next/prev so clicks hit session cache.
watch(feedPage, () => { warmAdjacentFeedPages() }, { flush: 'post' })
onMounted(() => { warmAdjacentFeedPages() })

// Homepage keeps the site-name title (no page suffix) and adds WebSite site-identity JSON-LD.
useHomeSeo()
</script>

<template>
  <HomeView
    :feed="feedItems"
    :feed-meta="feedMeta"
    :featured="featured"
    :hotspots="hotspots"
    :tags="tags"
    :profile="profile"
    :rail-cards="siteConfig?.data.home.railCards"
    :rail-data="railData"
    :fallback-cover="siteConfig?.data.site.featuredFallbackCover"
    :statistics-available="feedMeta.statisticsAvailable === true"
  />
</template>
