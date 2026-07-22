<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PersonalCard from '~/components/home/PersonalCard.vue'
import ProfileDetail from '~/components/profile/ProfileDetail.vue'
import type { ProfileSettings } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { useTblogTheme } from '~/composables/useTblogTheme'
import type { PublicProfile } from '~/types/settings'

const props = defineProps<{ profile: ProfileSettings }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useTblogI18n()
const { resolvedTheme } = useTblogTheme()
const mode = ref<'sidebar' | 'popover' | 'detail'>('sidebar')
const modes = computed(() => [
  { key: 'sidebar' as const, label: t('settings.profilePreviewSidebar') },
  { key: 'popover' as const, label: t('settings.profilePreviewPopover') },
  { key: 'detail' as const, label: t('settings.profilePreviewDetail') }
])

const visibleLinks = computed(() => [...props.profile.socialLinks]
  .filter(link => link.visible)
  .sort((a, b) => a.sortOrder - b.sortOrder))
const visibleProjects = computed(() => [...props.profile.projects]
  .filter(project => project.visible)
  .sort((a, b) => a.sortOrder - b.sortOrder))
const visibleJourney = computed(() => props.profile.journeyEnabled
  ? [...props.profile.journey].filter(item => item.visible).sort((a, b) => a.sortOrder - b.sortOrder)
  : [])
const publicProfile = computed<PublicProfile>(() => ({
  name: props.profile.name,
  role: props.profile.role,
  avatarUrl: props.profile.avatarUrl,
  shortBio: props.profile.shortBio,
  signature: props.profile.signature,
  introduction: props.profile.introduction,
  topics: [...props.profile.topics],
  currentStatus: props.profile.currentStatus,
  location: props.profile.location,
  socialLinks: visibleLinks.value.map(({ platform, url }) => ({ platform, url })),
  projects: visibleProjects.value.map(({ name, description, status, tags, url }) => ({ name, description, status, tags: [...tags], url })),
  journeyEnabled: props.profile.journeyEnabled,
  journey: visibleJourney.value.map(({ period, title, role, description }) => ({ period, title, role, description }))
}))
function close() {
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="profile-preview" role="dialog" aria-modal="true" :aria-label="t('settings.profilePreview')" @click.self="close">
      <section class="profile-preview__window">
        <header class="profile-preview__toolbar">
          <div>
            <strong>{{ t('settings.profilePreview') }}</strong>
            <span>{{ t('settings.profilePreviewUnsaved') }}</span>
          </div>
          <nav :aria-label="t('settings.profilePreviewState')">
            <button v-for="item in modes" :key="item.key" type="button" :class="{ active: mode === item.key }" :data-test="`profile-preview-${item.key}`" @click="mode = item.key">
              {{ item.label }}
            </button>
          </nav>
          <button type="button" class="profile-preview__close" :aria-label="t('common.cancel')" data-test="profile-preview-close" @click="close">×</button>
        </header>

        <div class="profile-preview__stage site-shell" :class="`profile-preview__stage--${mode}`" :data-theme="resolvedTheme">
          <div
            v-if="mode !== 'detail'"
            class="profile-preview__public-card"
            :class="`profile-preview__public-card--${mode}`"
          >
            <PersonalCard :profile="publicProfile" :preview-state="mode === 'popover' ? 'open' : 'closed'" />
          </div>

          <ProfileDetail v-else :profile="publicProfile" :show-close="false" title-id="admin-profile-preview-title" />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.profile-preview { position: fixed; z-index: 1000; inset: 0; display: grid; padding: 24px; place-items: center; background: rgba(18, 19, 23, .55); backdrop-filter: blur(8px); }
.profile-preview__window { display: flex; width: min(1040px, 100%); height: min(780px, calc(100vh - 48px)); flex-direction: column; overflow: hidden; border: 1px solid var(--color-line); border-radius: 22px; background: var(--color-page); box-shadow: 0 28px 80px rgba(var(--color-text-rgb), .28); }
.profile-preview__toolbar { display: grid; grid-template-columns: 1fr auto 36px; align-items: center; gap: 18px; padding: 12px 16px; border-bottom: 1px solid var(--color-line); background: var(--color-panel); }
.profile-preview__toolbar div { display: flex; flex-direction: column; gap: 1px; }.profile-preview__toolbar span { color: var(--color-muted); font-size: .72rem; }
.profile-preview__toolbar nav { display: flex; gap: 3px; padding: 3px; border-radius: 9px; background: var(--admin-subtle); }.profile-preview__toolbar nav button,.profile-preview__close { border: 0; background: transparent; color: var(--color-muted); cursor: pointer; }.profile-preview__toolbar nav button { padding: 6px 10px; border-radius: 7px; font-size: .76rem; font-weight: 700; }.profile-preview__toolbar nav button.active { color: var(--color-accent); background: var(--color-panel); box-shadow: 0 1px 5px rgba(0,0,0,.08); }.profile-preview__close { font-size: 1.25rem; }
.profile-preview__stage { display: grid; flex: 1; overflow: auto; padding: 54px; place-items: center; background: radial-gradient(circle at 30% 20%, rgba(var(--color-accent-rgb),.07), transparent 38%), var(--color-page); }
.profile-preview__public-card { width: min(280px,100%); pointer-events: none; }
.profile-preview__public-card--popover { width: min(390px,100%); }
.profile-preview__public-card--popover :deep(.personal-card) { display: none; }
.profile-preview__public-card--popover :deep(.profile-preview) { position: relative; z-index: auto; top: auto; left: auto; display: block; width: 100%; visibility: visible; opacity: 1; pointer-events: none; transform: none; transition: none; }
@media (max-width: 700px) { .profile-preview { padding: 0; }.profile-preview__window { height: 100%; border-radius: 0; }.profile-preview__toolbar { grid-template-columns: 1fr 32px; }.profile-preview__toolbar nav { grid-column: 1 / -1; grid-row: 2; justify-content: center; }.profile-preview__close { grid-column: 2; grid-row: 1; }.profile-preview__stage { padding: 26px 14px; } }
</style>
