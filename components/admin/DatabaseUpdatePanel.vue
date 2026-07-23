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

const isUpToDate = computed(() => (status.value?.pendingCount ?? 0) === 0)
const progressPercent = computed(() => {
  if (!status.value || status.value.latestVersion <= 0) return 0
  return Math.min(100, Math.round((status.value.currentVersion / status.value.latestVersion) * 100))
})
const appliedPreview = computed(() => (status.value?.applied ?? []).slice(-6).reverse())
const hasAppliedHistory = computed(() => (status.value?.appliedCount ?? 0) > 0)

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

function cancelConfirm() {
  if (applying.value) return
  confirming.value = false
}
</script>

<template>
  <section class="db-update settings-section" data-test="db-update-panel">
    <div class="settings-section__heading">
      <h3>{{ t('settings.database') }}</h3>
      <p class="admin-muted">{{ t('settings.databaseDesc') }}</p>
    </div>

    <div v-if="pending" class="db-update__state db-update__state--loading" data-test="db-update-loading">
      <span class="db-update__pulse" aria-hidden="true" />
      <p class="admin-muted">{{ t('common.loading') }}</p>
    </div>

    <p v-else-if="error" class="admin-alert" data-test="db-update-load-error">
      {{ t('settings.databaseLoadError') }}
    </p>

    <template v-else-if="status">
      <article
        class="db-update__hero"
        :class="isUpToDate ? 'db-update__hero--ok' : 'db-update__hero--pending'"
        data-test="db-update-hero"
      >
        <div class="db-update__hero-top">
          <div class="db-update__badge" :data-state="isUpToDate ? 'ok' : 'pending'">
            <span class="db-update__badge-dot" aria-hidden="true" />
            {{ isUpToDate ? t('settings.databaseStatusReady') : t('settings.databaseStatusPending') }}
          </div>
          <p class="db-update__hero-note">
            {{ isUpToDate ? t('settings.databaseUpToDate') : t('settings.databasePendingHint', { count: status.pendingCount }) }}
          </p>
        </div>

        <div class="db-update__metrics" role="group" :aria-label="t('settings.databaseVersion')">
          <div class="db-update__metric" :title="t('settings.databaseVersionHint')">
            <span class="db-update__metric-label">{{ t('settings.databaseCurrent') }}</span>
            <strong class="db-update__metric-value" data-test="db-update-current">{{ status.currentVersion }}</strong>
            <span class="db-update__metric-sub">{{ t('settings.databaseRevFromFile') }}</span>
          </div>
          <div class="db-update__metric-divider" aria-hidden="true" />
          <div class="db-update__metric" :title="t('settings.databaseVersionHint')">
            <span class="db-update__metric-label">{{ t('settings.databaseLatest') }}</span>
            <strong class="db-update__metric-value" data-test="db-update-latest">{{ status.latestVersion }}</strong>
            <span class="db-update__metric-sub">{{ t('settings.databaseRevFromFile') }}</span>
          </div>
          <div class="db-update__metric-divider" aria-hidden="true" />
          <div class="db-update__metric" :title="t('settings.databaseCountHint')">
            <span class="db-update__metric-label">{{ t('settings.databaseAppliedCount') }}</span>
            <strong class="db-update__metric-value">{{ status.appliedCount }}</strong>
            <span class="db-update__metric-sub">{{ t('settings.databaseFileCount') }}</span>
          </div>
          <div class="db-update__metric-divider" aria-hidden="true" />
          <div class="db-update__metric">
            <span class="db-update__metric-label">{{ t('settings.databasePendingCount') }}</span>
            <strong class="db-update__metric-value db-update__metric-value--accent">{{ status.pendingCount }}</strong>
            <span class="db-update__metric-sub">{{ t('settings.databaseFileCount') }}</span>
          </div>
        </div>

        <div class="db-update__progress" :aria-label="t('settings.databaseVersion')">
          <div class="db-update__progress-track">
            <div
              class="db-update__progress-fill"
              :style="{ width: `${progressPercent}%` }"
              data-test="db-update-progress"
            />
          </div>
          <span class="db-update__progress-label">{{ progressPercent }}%</span>
        </div>
      </article>

      <div v-if="!isUpToDate" class="db-update__panel db-update__panel--pending" data-test="db-update-pending">
        <header class="db-update__panel-head">
          <div>
            <h4 class="db-update__panel-title">{{ t('settings.databasePending') }}</h4>
            <p class="db-update__panel-meta">{{ t('settings.databasePendingMeta', { count: status.pendingCount }) }}</p>
          </div>
          <span class="db-update__count-chip">{{ status.pendingCount }}</span>
        </header>

        <ol class="db-update__ledger">
          <li v-for="(name, index) in status.pending" :key="name" class="db-update__ledger-row">
            <span class="db-update__ledger-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <code class="db-update__ledger-name">{{ name }}</code>
            <span class="db-update__ledger-tag">{{ t('settings.databasePendingTag') }}</span>
          </li>
        </ol>

        <div v-if="!confirming" class="db-update__actions">
          <button
            type="button"
            class="db-update__btn db-update__btn--primary"
            :disabled="applying"
            data-test="db-update-apply"
            @click="confirming = true"
          >
            {{ t('settings.databaseApply') }}
          </button>
          <p class="db-update__actions-hint">{{ t('settings.databaseApplyHint') }}</p>
        </div>

        <div v-else class="db-update__confirm" data-test="db-update-confirm-box" role="alertdialog" :aria-label="t('settings.databaseConfirm')">
          <div class="db-update__confirm-copy">
            <strong>{{ t('settings.databaseConfirmTitle') }}</strong>
            <p>{{ t('settings.databaseConfirm') }}</p>
          </div>
          <div class="db-update__confirm-actions">
            <button
              type="button"
              class="db-update__btn db-update__btn--danger"
              :disabled="applying"
              data-test="db-update-confirm"
              @click="apply"
            >
              {{ applying ? t('settings.databaseApplying') : t('common.confirm') }}
            </button>
            <button
              type="button"
              class="db-update__btn db-update__btn--ghost"
              :disabled="applying"
              data-test="db-update-cancel"
              @click="cancelConfirm"
            >
              {{ t('common.cancel') }}
            </button>
          </div>
        </div>
      </div>

      <div v-else class="db-update__panel db-update__panel--ready" data-test="db-update-ready">
        <div class="db-update__ready-mark" aria-hidden="true">✓</div>
        <div>
          <h4 class="db-update__panel-title">{{ t('settings.databaseReadyTitle') }}</h4>
          <p class="db-update__panel-meta">{{ t('settings.databaseUpToDate') }}</p>
        </div>
      </div>

      <div v-if="hasAppliedHistory" class="db-update__panel db-update__panel--history">
        <header class="db-update__panel-head">
          <div>
            <h4 class="db-update__panel-title">{{ t('settings.databaseHistory') }}</h4>
            <p class="db-update__panel-meta">{{ t('settings.databaseHistoryMeta', { count: status.appliedCount }) }}</p>
          </div>
        </header>
        <ul class="db-update__history">
          <li v-for="name in appliedPreview" :key="name" class="db-update__history-row">
            <span class="db-update__history-dot" aria-hidden="true" />
            <code>{{ name }}</code>
          </li>
        </ul>
        <p v-if="status.appliedCount > appliedPreview.length" class="db-update__history-more">
          {{ t('settings.databaseHistoryMore', { count: status.appliedCount - appliedPreview.length }) }}
        </p>
      </div>

      <p v-if="applyError" class="admin-alert db-update__flash" role="alert" data-test="db-update-error">
        {{ applyError }}
      </p>

      <div v-if="result" class="db-update__result" :class="{ 'db-update__result--failed': result.failed }" data-test="db-update-result">
        <header class="db-update__result-head">
          <span class="db-update__result-badge">
            {{ result.failed ? t('settings.databaseFailed') : t('settings.databaseApplied') }}
          </span>
          <span class="db-update__result-duration">{{ result.durationMs }}ms</span>
        </header>
        <p class="db-update__result-line">
          <span class="db-update__result-label">{{ t('settings.databaseApplied') }}</span>
          <code>{{ result.appliedNow.join(', ') || '—' }}</code>
        </p>
        <p v-if="result.failed" class="admin-alert db-update__error">
          {{ t('settings.databaseFailed') }}: {{ result.failed.migrations.join(', ') }} — {{ result.failed.error }}
        </p>
        <p v-if="result.pending.length" class="db-update__result-line">
          <span class="db-update__result-label">{{ t('settings.databasePending') }}</span>
          <code>{{ result.pending.join(', ') }}</code>
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.db-update {
  display: grid;
  gap: 16px;
}

.db-update__state {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 88px;
  padding: 18px 20px;
  border: 1px dashed var(--color-line);
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(var(--color-panel-rgb), 0.55), rgba(var(--color-panel-rgb), 0.2)),
    var(--color-page);
}

.db-update__pulse {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--color-accent);
  box-shadow: 0 0 0 0 rgba(var(--color-accent-rgb), 0.45);
  animation: db-pulse 1.4s ease-out infinite;
}

@keyframes db-pulse {
  0% { box-shadow: 0 0 0 0 rgba(var(--color-accent-rgb), 0.4); }
  70% { box-shadow: 0 0 0 12px rgba(var(--color-accent-rgb), 0); }
  100% { box-shadow: 0 0 0 0 rgba(var(--color-accent-rgb), 0); }
}

.db-update__hero {
  position: relative;
  overflow: hidden;
  display: grid;
  gap: 18px;
  padding: 22px 22px 20px;
  border: 1px solid var(--color-line);
  border-radius: 18px;
  background:
    radial-gradient(120% 90% at 100% 0%, rgba(var(--color-accent-rgb), 0.12), transparent 55%),
    linear-gradient(165deg, rgba(var(--color-panel-rgb), 0.96), rgba(var(--color-panel-rgb), 0.72));
  box-shadow: var(--shadow-card);
}

.db-update__hero--ok {
  background:
    radial-gradient(120% 90% at 100% 0%, rgba(var(--admin-success-rgb), 0.14), transparent 55%),
    linear-gradient(165deg, rgba(var(--color-panel-rgb), 0.96), rgba(var(--color-panel-rgb), 0.72));
}

.db-update__hero--pending {
  background:
    radial-gradient(120% 90% at 100% 0%, rgba(var(--color-accent-warm-rgb), 0.16), transparent 55%),
    linear-gradient(165deg, rgba(var(--color-panel-rgb), 0.96), rgba(var(--color-panel-rgb), 0.72));
}

.db-update__hero::after {
  content: '';
  position: absolute;
  inset: auto -20% -40% auto;
  width: 180px;
  height: 180px;
  border-radius: 40% 60% 55% 45%;
  background: rgba(var(--color-accent-rgb), 0.05);
  transform: rotate(18deg);
  pointer-events: none;
}

.db-update__hero-top {
  display: grid;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.db-update__badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  min-height: 30px;
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.db-update__badge[data-state='ok'] {
  color: var(--admin-success);
  background: rgba(var(--admin-success-rgb), 0.12);
  border: 1px solid rgba(var(--admin-success-rgb), 0.22);
}

.db-update__badge[data-state='pending'] {
  color: var(--color-accent-warm);
  background: rgba(var(--color-accent-warm-rgb), 0.12);
  border: 1px solid rgba(var(--color-accent-warm-rgb), 0.24);
}

.db-update__badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 18%, transparent);
}

.db-update__hero-note {
  margin: 0;
  max-width: 52ch;
  color: var(--color-muted);
  font-size: 0.9rem;
  line-height: 1.55;
}

.db-update__metrics {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr;
  gap: 0;
  padding: 4px 0 2px;
}

.db-update__metric {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 4px 8px;
}

.db-update__metric-label {
  color: var(--color-muted);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.db-update__metric-value {
  color: var(--color-text);
  font-size: 1.45rem;
  font-weight: 780;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  font-family: var(--font-display);
}

.db-update__metric-value--accent {
  color: var(--color-accent-warm);
}

.db-update__metric-sub {
  color: var(--color-muted);
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  opacity: 0.88;
}

.db-update__metric-divider {
  width: 1px;
  margin: 6px 0;
  background: var(--color-line);
}

.db-update__progress {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 12px;
}

.db-update__progress-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(var(--color-text-rgb), 0.06);
  border: 1px solid var(--color-line);
}

.db-update__progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 55%, var(--color-accent-warm)));
  box-shadow: 0 0 16px rgba(var(--color-accent-rgb), 0.25);
  transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

.db-update__hero--ok .db-update__progress-fill {
  background: linear-gradient(90deg, var(--admin-success), color-mix(in srgb, var(--admin-success) 60%, #9fd9b7));
}

.db-update__progress-label {
  color: var(--color-muted);
  font-size: 0.78rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.db-update__panel {
  display: grid;
  gap: 14px;
  padding: 18px 18px 16px;
  border: 1px solid var(--color-line);
  border-radius: 16px;
  background: rgba(var(--color-panel-rgb), 0.72);
  box-shadow: 0 10px 28px rgba(84, 70, 52, 0.04);
}

.db-update__panel--pending {
  border-color: rgba(var(--color-accent-warm-rgb), 0.28);
  background:
    linear-gradient(180deg, rgba(var(--color-accent-warm-rgb), 0.05), transparent 48%),
    rgba(var(--color-panel-rgb), 0.8);
}

.db-update__panel--ready {
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 14px;
  border-color: rgba(var(--admin-success-rgb), 0.22);
  background:
    linear-gradient(180deg, rgba(var(--admin-success-rgb), 0.08), transparent 55%),
    rgba(var(--color-panel-rgb), 0.8);
}

.db-update__ready-mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: var(--admin-success);
  font-size: 1.15rem;
  font-weight: 800;
  background: rgba(var(--admin-success-rgb), 0.12);
  border: 1px solid rgba(var(--admin-success-rgb), 0.2);
}

.db-update__panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.db-update__panel-title {
  margin: 0;
  color: var(--color-text);
  font-size: 0.98rem;
  font-weight: 780;
  letter-spacing: -0.01em;
}

.db-update__panel-meta {
  margin: 4px 0 0;
  color: var(--color-muted);
  font-size: 0.8rem;
  line-height: 1.45;
}

.db-update__count-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  min-height: 28px;
  padding: 0 9px;
  border-radius: 999px;
  color: var(--color-accent-warm);
  font-size: 0.78rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: rgba(var(--color-accent-warm-rgb), 0.12);
  border: 1px solid rgba(var(--color-accent-warm-rgb), 0.2);
}

.db-update__ledger {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.db-update__ledger-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid var(--color-line);
  border-radius: 12px;
  background: rgba(var(--color-page-rgb), 0.55);
}

.db-update__ledger-index {
  color: var(--color-muted);
  font-size: 0.72rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.db-update__ledger-name {
  overflow: hidden;
  color: var(--color-text);
  font-family: ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.db-update__ledger-tag {
  color: var(--color-accent-warm);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.db-update__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding-top: 2px;
}

.db-update__actions-hint {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.78rem;
}

.db-update__btn {
  min-height: 38px;
  padding: 8px 14px;
  border-radius: 11px;
  border: 1px solid var(--color-line);
  background: var(--color-page);
  color: var(--color-text);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.12s ease, opacity 0.15s ease;
}

.db-update__btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-line));
  background: var(--admin-hover);
}

.db-update__btn:active:not(:disabled) {
  transform: translateY(1px);
}

.db-update__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.db-update__btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.db-update__btn--primary {
  border-color: color-mix(in srgb, var(--color-accent) 40%, var(--color-line));
  background: var(--color-accent);
  color: #fff;
  box-shadow: 0 8px 18px rgba(var(--color-accent-rgb), 0.22);
}

.db-update__btn--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent) 88%, #000);
  border-color: transparent;
}

.db-update__btn--danger {
  border-color: rgba(var(--color-accent-warm-rgb), 0.45);
  background: var(--color-accent-warm);
  color: #fff;
  box-shadow: 0 8px 18px rgba(var(--color-accent-warm-rgb), 0.22);
}

.db-update__btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent-warm) 88%, #000);
}

.db-update__btn--ghost {
  background: transparent;
}

.db-update__confirm {
  display: grid;
  gap: 14px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(var(--color-accent-warm-rgb), 0.35);
  background:
    linear-gradient(135deg, rgba(var(--color-accent-warm-rgb), 0.1), transparent 60%),
    rgba(var(--color-page-rgb), 0.7);
}

.db-update__confirm-copy {
  display: grid;
  gap: 4px;
}

.db-update__confirm-copy strong {
  color: var(--color-text);
  font-size: 0.9rem;
}

.db-update__confirm-copy p {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.db-update__confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.db-update__history {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.db-update__history-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding: 4px 2px;
  color: var(--color-muted);
  font-family: ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.78rem;
}

.db-update__history-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(var(--admin-success-rgb), 0.75);
  box-shadow: 0 0 0 3px rgba(var(--admin-success-rgb), 0.12);
  flex: 0 0 auto;
}

.db-update__history-more {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.76rem;
}

.db-update__flash,
.db-update__error {
  margin: 0;
}

.db-update__result {
  display: grid;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid rgba(var(--admin-success-rgb), 0.25);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(var(--admin-success-rgb), 0.08), transparent 60%),
    rgba(var(--color-panel-rgb), 0.78);
}

.db-update__result--failed {
  border-color: rgba(var(--color-accent-warm-rgb), 0.35);
  background:
    linear-gradient(180deg, rgba(var(--color-accent-warm-rgb), 0.08), transparent 60%),
    rgba(var(--color-panel-rgb), 0.78);
}

.db-update__result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.db-update__result-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 2px 10px;
  border-radius: 999px;
  color: var(--admin-success);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: rgba(var(--admin-success-rgb), 0.12);
}

.db-update__result--failed .db-update__result-badge {
  color: var(--color-accent-warm);
  background: rgba(var(--color-accent-warm-rgb), 0.12);
}

.db-update__result-duration {
  color: var(--color-muted);
  font-size: 0.78rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.db-update__result-line {
  display: grid;
  gap: 4px;
  margin: 0;
}

.db-update__result-label {
  color: var(--color-muted);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.db-update__result-line code {
  color: var(--color-text);
  font-family: ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.8rem;
  word-break: break-all;
}

@media (max-width: 720px) {
  .db-update__metrics {
    grid-template-columns: 1fr 1fr;
    gap: 12px 10px;
  }

  .db-update__metric-divider {
    display: none;
  }

  .db-update__metric {
    padding: 8px 10px;
    border: 1px solid var(--color-line);
    border-radius: 12px;
    background: rgba(var(--color-page-rgb), 0.45);
  }

  .db-update__ledger-row {
    grid-template-columns: auto 1fr;
  }

  .db-update__ledger-tag {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
