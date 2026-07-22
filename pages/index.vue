<script setup lang="ts">
import { computed, watch } from 'vue'
import HomeView from '~/components/home/HomeView.vue'
import { useHomeBootstrap } from '~/composables/usePublicApi'
import { useOptionalPublicSiteConfigData } from '~/composables/useSiteConfig'
import { useHomeSeo } from '~/composables/useSeo'
import { HOME_FEED_PAGE_SIZE, homeFeedSortValues, sortOrderValues, type HomeFeedSort, type SortOrder } from '~/types/home-feed'
import { resolvedHomePageReplacement } from '~/utils/home-feed-navigation'

const route = useRoute()

definePageMeta({ key: route => route.fullPath })

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
const { data: bootstrap, error } = await useHomeBootstrap(feedQuery)

if (error.value && import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 503, 'Homepage temporarily unavailable')
}
if (error.value && import.meta.client && !useNuxtApp().isHydrating) {
  throw createError({ statusCode: 503, statusMessage: 'Homepage temporarily unavailable', fatal: true })
}

const feedItems = computed(() => bootstrap.value?.data.feed.items ?? [])
const feedMeta = computed(() => bootstrap.value?.data.feed.meta ?? ({
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

watch(bootstrap, (resolvedBootstrap) => {
  const meta = resolvedBootstrap?.data.feed.meta
  if (import.meta.client && meta?.effectiveSort && meta.effectiveSort !== feedQuery.value.sort) {
    void navigateTo({
      path: '/',
      query: { sort: meta.effectiveSort, order: 'desc', page: String(meta.page) },
      hash: '#articles'
    }, { replace: true })
    return
  }
  const page = resolvedHomePageReplacement(
    meta?.page,
    feedQuery.value.page
  )
  if (import.meta.server || page === null) return
  void navigateTo({
    path: '/',
    query: { sort: feedQuery.value.sort, order: feedQuery.value.order, page: String(page) },
    hash: '#articles'
  }, { replace: true })
}, { immediate: !import.meta.server })

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
