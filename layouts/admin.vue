<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import AdminShell from '~/components/admin/AdminShell.vue'
import {
  adminLogout,
  type DashboardMetricsView,
  useLazyAdminCommentCounts,
  useAdminSessionSnapshot
} from '~/composables/useAdminApi'
import type { Envelope } from '~/composables/usePublicApi'

const route = useRoute()
const adminSession = useAdminSessionSnapshot()
const { data: dashboardData } = useNuxtData<Envelope<DashboardMetricsView>>('admin-dashboard-metrics')
const { data: commentCountData, execute: loadCommentCount } = useLazyAdminCommentCounts()

const adminName = computed(() => adminSession.value?.administrator.username ?? '')
const pendingComments = computed(() =>
  dashboardData.value?.data.pendingComments ?? commentCountData.value?.data.pending ?? 0
)
const activeKey = computed(() => {
  if (route.path === '/admin') {
    return 'dashboard'
  }
  if (route.path.startsWith('/admin/posts')) {
    return 'posts'
  }
  if (route.path.startsWith('/admin/profile')) {
    return 'profile'
  }
  if (route.path === '/admin/about') {
    return 'about'
  }
  if (route.path.startsWith('/admin/taxonomy')) {
    return 'taxonomy'
  }
  if (route.path.startsWith('/admin/comments')) {
    return 'comments'
  }
  if (route.path.startsWith('/admin/home-cards')) {
    return 'home-cards'
  }
  if (route.path.startsWith('/admin/settings')) {
    return 'settings'
  }
  return ''
})

async function handleSignOut() {
  await adminLogout()
  await navigateTo('/admin/login')
}

async function ensureCommentCount() {
  if (route.path !== '/admin' && !dashboardData.value && !commentCountData.value) {
    await loadCommentCount()
  }
}

onMounted(() => { void ensureCommentCount() })
watch(() => route.path, () => { void ensureCommentCount() })
</script>

<template>
  <AdminShell
    :admin-name="adminName"
    :active-key="activeKey"
    :pending-comments="pendingComments"
    @sign-out="handleSignOut"
  >
    <slot />
  </AdminShell>
</template>
