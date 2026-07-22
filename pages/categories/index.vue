<script setup lang="ts">
import { computed } from 'vue'
import TaxonomyList from '~/components/taxonomy/TaxonomyList.vue'
import { useCategories } from '~/composables/usePublicApi'
import { useBasicPageSeo } from '~/composables/useSeo'
import { useTblogI18n } from '~/composables/useTblogI18n'

const { data, error } = await useCategories()
if (error.value && import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 503, 'Categories temporarily unavailable')
}
if (error.value && import.meta.client && !useNuxtApp().isHydrating) {
  throw createError({ statusCode: 503, statusMessage: 'Categories temporarily unavailable', fatal: true })
}
const items = computed(() => data.value?.data ?? [])
const { t } = useTblogI18n()

useBasicPageSeo({ title: () => '分类' })
</script>

<template>
  <TaxonomyList :heading="t('nav.categories')" :items="items" base-path="/categories" />
</template>
