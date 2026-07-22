<script setup lang="ts">
import { computed } from 'vue'
import DashboardMetricCard from '~/components/admin/DashboardMetricCard.vue'
import { useDashboardMetrics } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const { data, error } = useDashboardMetrics()
const metrics = computed(() => data.value?.data ?? null)
const { t } = useTblogI18n()

const cards = computed(() => {
  const current = metrics.value
  if (!current) {
    return []
  }
  return [
    { key: 'publishedArticles', label: t('admin.publishedArticles'), value: current.publishedArticles },
    { key: 'drafts', label: t('admin.drafts'), value: current.drafts },
    { key: 'categories', label: t('admin.categories'), value: current.categories },
    { key: 'tags', label: t('admin.tags'), value: current.tags },
    { key: 'pendingComments', label: t('admin.pendingComments'), value: current.pendingComments }
  ]
})
</script>

<template>
  <section class="admin-dashboard">
    <h1 class="admin-dashboard__title">{{ t('admin.dashboard') }}</h1>

    <p v-if="error" class="admin-dashboard__empty">{{ t('admin.metricsUnavailable') }}</p>
    <div v-else class="admin-dashboard__grid">
      <DashboardMetricCard
        v-for="card in cards"
        :key="card.key"
        :label="card.label"
        :value="card.value"
      />
    </div>
  </section>
</template>
