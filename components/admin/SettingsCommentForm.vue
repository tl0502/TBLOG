<script setup lang="ts">
import { settingsIssueMessage, type CommentSettings, type SettingsValidationIssue } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

const props = defineProps<{ value: CommentSettings; issues: SettingsValidationIssue[] }>()
const { t } = useTblogI18n()

function handleEnabledChange() {
  if (!props.value.enabled) {
    props.value.autoModerationEnabled = false
  }
}
</script>

<template>
  <div class="settings-form">
    <label class="settings-field settings-field--check">
      <input
        v-model="value.enabled"
        data-test="comment-enabled"
        type="checkbox"
        @change="handleEnabledChange"
      >
      <span class="settings-field__label">{{ t('settings.acceptComments') }}</span>
    </label>

    <label class="settings-field settings-field--check">
      <input
        v-model="value.autoModerationEnabled"
        data-test="comment-auto-moderation"
        type="checkbox"
        :disabled="!value.enabled"
      >
      <span class="settings-field__label">{{ t('settings.autoModeration') }}</span>
    </label>

    <p class="admin-muted">{{ t('settings.autoModerationNotice') }}</p>
    <p class="admin-muted">{{ t('settings.turnstileIntegrationNotice') }}</p>
  </div>
</template>
