<script setup lang="ts">
import { computed } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'
import LocaleSwitcher from '~/components/site/LocaleSwitcher.vue'
import ThemeSwitcher from '~/components/site/ThemeSwitcher.vue'

interface Props {
  adminName: string
  activeKey?: string
  pendingComments?: number
}

withDefaults(defineProps<Props>(), { pendingComments: 0 })
const emit = defineEmits<{ signOut: [] }>()
const { t } = useTblogI18n()

const navItems = computed(() => [
  { key: 'dashboard', label: t('admin.dashboard'), to: '/admin' },
  { key: 'posts', label: t('admin.posts'), to: '/admin/posts' },
  { key: 'profile', label: t('admin.profile'), to: '/admin/profile' },
  { key: 'about', label: t('admin.about'), to: '/admin/about' },
  { key: 'taxonomy', label: t('admin.taxonomy'), to: '/admin/taxonomy' },
  { key: 'comments', label: t('admin.comments'), to: '/admin/comments' },
  { key: 'home-cards', label: t('admin.homeCards'), to: '/admin/home-cards' },
  { key: 'settings', label: t('admin.settings'), to: '/admin/settings' }
] as const)
</script>

<template>
  <aside class="admin-sidebar">
    <div class="admin-sidebar__brand">{{ t('admin.title') }}</div>

    <nav class="admin-sidebar__nav" :aria-label="t('admin.navLabel')">
      <template v-for="item in navItems" :key="item.key">
        <NuxtLink
          class="admin-sidebar__link"
          :class="{ 'admin-sidebar__link--active': item.key === activeKey }"
          :to="item.to"
          :aria-current="item.key === activeKey ? 'page' : undefined"
        >
          {{ item.label }}
          <span
            v-if="item.key === 'comments' && pendingComments > 0"
            class="admin-sidebar__count"
            data-test="pending-comments-count"
          >{{ pendingComments }}</span>
        </NuxtLink>
      </template>
    </nav>

    <div class="admin-sidebar__footer">
      <div class="admin-sidebar__appearance" :aria-label="t('theme.label')">
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>
      <span class="admin-sidebar__user">{{ adminName }}</span>
      <button type="button" class="admin-sidebar__signout" @click="emit('signOut')">
        {{ t('admin.signOut') }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.admin-sidebar__appearance {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-line);
}

.admin-sidebar__appearance :deep(.theme-switcher) {
  margin-inline-start: 0;
}

.admin-sidebar__count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-accent-warm);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 1.5;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
</style>
