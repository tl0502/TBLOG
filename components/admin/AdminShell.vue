<script setup lang="ts">
import { shallowRef } from 'vue'
import AdminSidebar from '~/components/admin/AdminSidebar.vue'
import LocaleSwitcher from '~/components/site/LocaleSwitcher.vue'
import ThemeSwitcher from '~/components/site/ThemeSwitcher.vue'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { useTblogTheme } from '~/composables/useTblogTheme'

interface Props {
  adminName: string
  activeKey?: string
  pendingComments?: number
}

withDefaults(defineProps<Props>(), { pendingComments: 0 })
const emit = defineEmits<{ signOut: [] }>()

const drawerOpen = shallowRef(false)
const { t } = useTblogI18n()
const { resolvedColorMode } = useTblogTheme()

function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}
</script>

<template>
  <div
    class="admin-shell"
    :class="{ 'admin-shell--drawer-open': drawerOpen }"
    :data-color-mode="resolvedColorMode"
  >
    <header class="admin-shell__bar">
      <button
        type="button"
        class="admin-shell__menu"
        :aria-expanded="drawerOpen"
        :aria-label="t('admin.toggleNav')"
        @click="toggleDrawer"
      >
        {{ t('admin.menu') }}
      </button>
      <span class="admin-shell__title">{{ t('admin.title') }}</span>
      <div class="admin-shell__appearance">
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>
    </header>

    <AdminSidebar
      class="admin-shell__sidebar"
      :admin-name="adminName"
      :active-key="activeKey"
      :pending-comments="pendingComments"
      @sign-out="emit('signOut')"
    />

    <main class="admin-shell__main">
      <slot />
    </main>
  </div>
</template>
