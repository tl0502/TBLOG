<script setup lang="ts">
import { useTblogI18n } from '~/composables/useTblogI18n'

const { t } = useTblogI18n()
</script>

<template>
  <div class="settings-form" data-test="settings-media-policy">
    <p class="admin-muted">{{ t('settings.externalUrlsAlwaysAvailable') }}</p>
    <p class="admin-muted">{{ t('settings.mediaIntegrationNotice') }}</p>
  </div>
</template>
