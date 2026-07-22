<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import {
  apiErrorMessage,
  applyAdminMigrations,
  useAdminMigrationStatus,
  type AdminMigrationApplyResultView
} from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

const { t } = useTblogI18n()
const { data, pending, error, refresh } = useAdminMigrationStatus()
const status = computed(() => data.value?.data ?? null)
const confirming = shallowRef(false)
const applying = shallowRef(false)
const result = shallowRef<AdminMigrationApplyResultView | null>(null)
const applyError = shallowRef('')

async function apply() {
  applying.value = true
  applyError.value = ''
  result.value = null
  try {
    const response = await applyAdminMigrations()
    result.value = response.data
    confirming.value = false
    await refresh()
  } catch (err) {
    applyError.value = apiErrorMessage(err, t('settings.databaseApplyFailed'))
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <section class="db-update settings-section">
    <div class="settings-section__heading">
      <h3>{{ t('settings.database') }}</h3>
      <p class="admin-muted">{{ t('settings.databaseDesc') }}</p>
    </div>
    <p v-if="pending" class="admin-muted">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="admin-alert" data-test="db-update-load-error">{{ t('settings.databaseLoadError') }}</p>
    <template v-else-if="status">
      <p class="db-update__version">
        {{ t('settings.databaseVersion') }}: {{ status.currentVersion }} / {{ status.latestVersion }}
      </p>
      <p v-if="status.pendingCount === 0" class="admin-muted">{{ t('settings.databaseUpToDate') }}</p>
      <div v-else class="db-update__pending">
        <p>{{ t('settings.databasePending') }} ({{ status.pendingCount }}):</p>
        <ul class="db-update__list">
          <li v-for="name in status.pending" :key="name">{{ name }}</li>
        </ul>
        <button
          v-if="!confirming"
          type="button"
          class="settings-panel__save"
          :disabled="applying"
          data-test="db-update-apply"
          @click="confirming = true"
        >
          {{ t('settings.databaseApply') }}
        </button>
        <div v-else class="db-update__confirm">
          <p>{{ t('settings.databaseConfirm') }}</p>
          <button type="button" class="settings-panel__save" :disabled="applying" data-test="db-update-confirm" @click="apply">
            {{ t('common.confirm') }}
          </button>
          <button type="button" class="settings-panel__sync" :disabled="applying" @click="confirming = false">
            {{ t('common.cancel') }}
          </button>
        </div>
      </div>
      <p v-if="applyError" class="admin-alert db-update__error" data-test="db-update-error">{{ applyError }}</p>
      <div v-if="result" class="db-update__result" data-test="db-update-result">
        <p>{{ t('settings.databaseApplied') }}: {{ result.appliedNow.join(', ') || '—' }} ({{ result.durationMs }}ms)</p>
        <p v-if="result.failed" class="admin-alert db-update__error">
          {{ t('settings.databaseFailed') }}: {{ result.failed.migrations.join(', ') }} — {{ result.failed.error }}
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.db-update__version {
  color: var(--color-text);
  font-weight: 700;
}

.db-update__pending {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.db-update__list {
  margin: 0;
  padding-left: 20px;
  color: var(--color-text);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.82rem;
}

.db-update__confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.db-update__result {
  margin-top: 12px;
}

.db-update__error {
  margin-top: 8px;
}
</style>
