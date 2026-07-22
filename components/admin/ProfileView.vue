<script setup lang="ts">
import SettingsDomainPanel from '~/components/admin/SettingsDomainPanel.vue'
import { useTblogI18n } from '~/composables/useTblogI18n'
const { t } = useTblogI18n()
</script>

<template>
  <section class="admin-profile">
    <div class="admin-page-header"><div><h1 class="admin-page-header__title">{{ t('settings.profile') }}</h1><p class="admin-page-header__meta">{{ t('settings.profileDesc') }}</p></div></div>
    <div class="admin-profile__body"><SettingsDomainPanel domain="profile" /></div>
  </section>
</template>

<style scoped>
.admin-profile { display: flex; flex-direction: column; gap: 16px; }
.admin-profile__body { padding: 22px; border: 1px solid var(--color-line); border-radius: 14px; background: var(--color-panel); box-shadow: var(--shadow-card); }
:deep(.settings-form) { display: flex; flex-direction: column; gap: 14px; }
:deep(.settings-field) { display: flex; flex-direction: column; gap: 5px; }
:deep(.settings-field__label) { color: var(--color-text); font-size: .82rem; font-weight: 700; }
:deep(.settings-field__input) { padding: 8px 10px; border: 1px solid var(--color-line); border-radius: 8px; background: var(--color-bg); color: var(--color-text); font: inherit; }
:deep(.settings-field__error) { color: var(--color-accent-warm); font-size: .78rem; }
:deep(.settings-field-row) { display: flex; gap: 12px; }
:deep(.settings-field-row) .settings-field { flex: 1; }
:deep(.settings-panel__footer) { margin-top: 18px; }
:deep(.settings-panel__save) { min-height: 36px; padding: 8px 18px; border: 0; border-radius: 8px; background: var(--color-accent); color: #fff; font-weight: 700; cursor: pointer; }
:deep(.settings-panel__save):disabled { opacity: .6; cursor: not-allowed; }
:deep(.settings-panel__saved) { margin: 0 0 12px; color: var(--admin-success); font-size: .84rem; font-weight: 700; }
@media (max-width: 640px) { .admin-profile__body { padding: 16px; } :deep(.settings-field-row) { flex-direction: column; } }
</style>
