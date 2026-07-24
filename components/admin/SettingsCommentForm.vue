<script setup lang="ts">
import { computed } from 'vue'
import {
  settingsIssueMessage,
  useAdminIntegrations,
  type CommentSettings,
  type SettingsValidationIssue
} from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

const props = defineProps<{ value: CommentSettings; issues: SettingsValidationIssue[] }>()
const { t } = useTblogI18n()
const err = (path: (string | number)[]) => settingsIssueMessage(props.issues, path)

// Shared with IntegrationCenter via the same fetch key; do not await so this form stays sync for tests.
const { data: integrationsData } = useAdminIntegrations()

const protectionReady = computed(() =>
  (integrationsData.value?.data ?? []).some((row) =>
    row.capability === 'commentProtection'
    && row.enabled
    && (row.status === 'active' || row.status === 'configured')
    && row.missingSecrets.length === 0
  )
)

const moderationReady = computed(() => {
  const active = (integrationsData.value?.data ?? []).filter((row) =>
    row.capability === 'commentModeration'
    && row.enabled
    && row.status === 'active'
  )
  return active.length === 1
})

function handleEnabledChange() {
  if (!props.value.enabled) {
    props.value.autoModerationEnabled = false
  }
}

function parseOptionalPositiveInt(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < 1) return null
  return value
}

function setRateWindow(raw: string) {
  props.value.rateLimit.windowSeconds = parseOptionalPositiveInt(raw)
}

function setRateMax(raw: string) {
  props.value.rateLimit.maxPerWindow = parseOptionalPositiveInt(raw)
}
</script>

<template>
  <div class="settings-form" data-test="comment-settings-form">
    <label class="settings-field settings-field--check">
      <input
        v-model="value.enabled"
        data-test="comment-enabled"
        type="checkbox"
        @change="handleEnabledChange"
      >
      <span class="settings-field__label">{{ t('settings.acceptComments') }}</span>
    </label>

    <p v-if="value.enabled && !protectionReady" class="admin-alert" role="status" data-test="comment-protection-warning">
      {{ t('settings.commentProtectionWarning') }}
    </p>

    <label class="settings-field settings-field--check">
      <input
        v-model="value.autoModerationEnabled"
        data-test="comment-auto-moderation"
        type="checkbox"
        :disabled="!value.enabled"
      >
      <span class="settings-field__label">{{ t('settings.autoModeration') }}</span>
    </label>

    <p class="admin-muted">{{ t('settings.commentPendingFixed') }}</p>
    <p class="admin-muted">{{ t('settings.autoModerationNotice') }}</p>
    <p
      v-if="value.enabled && value.autoModerationEnabled && !moderationReady"
      class="admin-alert"
      role="status"
      data-test="comment-moderation-warning"
    >
      {{ t('settings.commentModerationWarning') }}
    </p>
    <p class="admin-muted">{{ t('settings.turnstileIntegrationNotice') }}</p>

    <div class="settings-field-row">
      <label class="settings-field">
        <span class="settings-field__label">{{ t('settings.rateWindow') }}</span>
        <input
          data-test="comment-rate-window"
          class="settings-field__input"
          type="number"
          min="1"
          max="86400"
          step="1"
          :disabled="!value.enabled"
          :value="value.rateLimit.windowSeconds ?? ''"
          :placeholder="t('settings.rateLimitDefaultWindow')"
          @input="setRateWindow(($event.target as HTMLInputElement).value)"
        >
        <span v-if="err(['rateLimit', 'windowSeconds'])" class="settings-field__error">{{ err(['rateLimit', 'windowSeconds']) }}</span>
      </label>
      <label class="settings-field">
        <span class="settings-field__label">{{ t('settings.maxComments') }}</span>
        <input
          data-test="comment-rate-max"
          class="settings-field__input"
          type="number"
          min="1"
          max="1000"
          step="1"
          :disabled="!value.enabled"
          :value="value.rateLimit.maxPerWindow ?? ''"
          :placeholder="t('settings.rateLimitDefaultMax')"
          @input="setRateMax(($event.target as HTMLInputElement).value)"
        >
        <span v-if="err(['rateLimit', 'maxPerWindow'])" class="settings-field__error">{{ err(['rateLimit', 'maxPerWindow']) }}</span>
      </label>
    </div>
    <p class="admin-muted">{{ t('settings.rateLimitHint') }}</p>
  </div>
</template>
