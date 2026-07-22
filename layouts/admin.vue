<script setup lang="ts">
import { computed } from 'vue'
import AdminShell from '~/components/admin/AdminShell.vue'
import {
  adminLogout,
  useAdminCommentCounts,
  useAdminSessionSnapshot
} from '~/composables/useAdminApi'

const route = useRoute()
const adminSession = useAdminSessionSnapshot()
const { data: commentCountData } = useAdminCommentCounts()

const adminName = computed(() => adminSession.value?.administrator.username ?? '')
const pendingComments = computed(() => commentCountData.value?.data.pending ?? 0)
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
