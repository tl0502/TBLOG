<script setup lang="ts">
import { computed } from 'vue'
import TaxonomyList from '~/components/taxonomy/TaxonomyList.vue'
import { useTags } from '~/composables/usePublicApi'
import { useBasicPageSeo } from '~/composables/useSeo'
import { useTblogI18n } from '~/composables/useTblogI18n'

const { data, error } = await useTags()
if (error.value && import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 503, 'Tags temporarily unavailable')
}
if (error.value && import.meta.client && !useNuxtApp().isHydrating) {
  throw createError({ statusCode: 503, statusMessage: 'Tags temporarily unavailable', fatal: true })
}
const items = computed(() => data.value?.data ?? [])
const { t } = useTblogI18n()

useBasicPageSeo({ title: () => '标签' })
</script>

<template>
  <TaxonomyList :heading="t('nav.tags')" :items="items" base-path="/tags" />
</template>
