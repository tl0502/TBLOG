<script setup lang="ts">
import { computed } from 'vue'
import ArchiveView from '~/components/archive/ArchiveView.vue'
import { useArchive } from '~/composables/usePublicApi'
import { useBasicPageSeo } from '~/composables/useSeo'

const { data, error } = await useArchive()
if (error.value && import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 503, 'Archive temporarily unavailable')
}
if (error.value && import.meta.client && !useNuxtApp().isHydrating) {
  throw createError({ statusCode: 503, statusMessage: 'Archive temporarily unavailable', fatal: true })
}
const groups = computed(() => data.value?.data ?? [])

useBasicPageSeo({ title: () => '归档' })
</script>

<template>
  <ArchiveView :groups="groups" />
</template>
