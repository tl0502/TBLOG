<script setup lang="ts">
import { computed, defineAsyncComponent, shallowRef, watch } from 'vue'
import SettingsDomainPanel from '~/components/admin/SettingsDomainPanel.vue'
import SettingsMediaForm from '~/components/admin/SettingsMediaForm.vue'
import {
  apiErrorMessage,
  syncAdminAnalyticsReport,
  updateAdminAnalyticsReportSettings,
  useAdminAnalyticsReportStatus,
  type AnalyticsReportSchedule,
  type AnalyticsReportWeekday,
  type IntegrationCapability,
  type SettingsDomain
} from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

// Heavy, tab-gated panels load on demand so they stay out of the settings route's initial JS chunk.
const SettingsSecurityView = defineAsyncComponent(() => import('~/components/admin/SettingsSecurityView.vue'))
const DatabaseUpdatePanel = defineAsyncComponent(() => import('~/components/admin/DatabaseUpdatePanel.vue'))
const IntegrationCenter = defineAsyncComponent(() => import('~/components/admin/IntegrationCenter.vue'))

interface Tab {
  key: SettingsDomain | 'analytics' | 'performance' | 'database'
  label: string
  description: string
}

const { t } = useTblogI18n()
const tabs = computed<Tab[]>(() => [
  { key: 'site', label: t('settings.site'), description: t('settings.siteDesc') },
  { key: 'seo', label: t('settings.seo'), description: t('settings.seoDesc') },
  { key: 'comment', label: t('settings.comment'), description: t('settings.commentDesc') },
  { key: 'analytics', label: t('settings.analytics'), description: t('settings.analyticsDesc') },
  { key: 'media', label: t('settings.media'), description: t('settings.mediaDesc') },
  { key: 'security', label: t('settings.security'), description: t('settings.securityDesc') },
  { key: 'search', label: t('settings.search'), description: t('settings.searchDesc') },
  { key: 'performance', label: t('settings.performance'), description: t('settings.performanceDesc') },
  { key: 'database', label: t('settings.database'), description: t('settings.databaseDesc') }
])

const activeKey = shallowRef<Tab['key']>('site')
const { data: reportData, pending: reportPending, error: reportLoadError, refresh: refreshReport } = useAdminAnalyticsReportStatus()
// The report status only surfaces in the Analytics tab, so fetch it on first open instead of on
// every settings load. The `!reportData.value` guard keeps it off other tabs and off the refetch path.
watch(activeKey, (key) => {
  if (key === 'analytics' && !reportData.value) void refreshReport()
}, { immediate: true })
const reportEnabled = shallowRef(false)
const reportSchedule = shallowRef<AnalyticsReportSchedule>('off')
const reportTimeOfDay = shallowRef('03:00')
const reportTimezone = shallowRef('UTC')
const reportDayOfWeek = shallowRef<AnalyticsReportWeekday>('mon')
const reportUsesCalendar = computed(() => reportSchedule.value === 'daily' || reportSchedule.value === 'weekly')
const reportTimezones = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles'
] as const
const reportSaving = shallowRef(false)
const reportSyncing = shallowRef(false)
const reportMessage = shallowRef('')
const reportSaveError = shallowRef('')
const reportRefreshWarning = shallowRef('')
watch(() => reportData.value?.data, (value) => {
  if (!value) return
  reportEnabled.value = value.enabled
  reportSchedule.value = value.schedule
  reportTimeOfDay.value = value.timeOfDay
  reportTimezone.value = value.timezone
  reportDayOfWeek.value = value.dayOfWeek
}, { immediate: true })

async function saveReportSettings() {
  reportSaving.value = true
  reportMessage.value = ''
  reportSaveError.value = ''
  reportRefreshWarning.value = ''
  try {
    await updateAdminAnalyticsReportSettings({
      enabled: reportEnabled.value,
      schedule: reportSchedule.value,
      timeOfDay: reportTimeOfDay.value,
      timezone: reportTimezone.value,
      dayOfWeek: reportDayOfWeek.value
    })
    reportMessage.value = t('analytics.reportSettingsSaved')
  } catch (error) {
    reportSaveError.value = apiErrorMessage(error, t('analytics.reportSettingsError'))
    reportSaving.value = false
    return
  }

  try {
    await refreshReport()
  } catch {
    reportRefreshWarning.value = t('analytics.reportSettingsRefreshError')
  } finally {
    reportSaving.value = false
  }
}

async function syncReport() {
  reportSyncing.value = true
  reportSaveError.value = ''
  reportRefreshWarning.value = ''
  try {
    await syncAdminAnalyticsReport()
    reportMessage.value = t('analytics.reportSyncComplete')
  } catch (error) {
    reportSaveError.value = apiErrorMessage(error, t('analytics.reportSyncError'))
    reportSyncing.value = false
    return
  }

  try {
    await refreshReport()
  } catch {
    reportRefreshWarning.value = t('analytics.reportSettingsRefreshError')
  } finally {
    reportSyncing.value = false
  }
}

function isEditableDomainTab(key: Tab['key']): key is Exclude<SettingsDomain, 'home' | 'security' | 'search' | 'media'> {
  return key !== 'home' && key !== 'search' && key !== 'performance' && key !== 'security' && key !== 'media' && key !== 'analytics' && key !== 'database'
}

function integrationCapabilities(key: Tab['key']): IntegrationCapability[] {
  const capabilities: Partial<Record<Tab['key'], IntegrationCapability[]>> = {
    comment: ['commentProtection', 'commentModeration'],
    analytics: ['analytics', 'analyticsReport'],
    media: ['image', 'storage'],
    search: ['search'],
    performance: ['cache']
  }
  return capabilities[key] ?? []
}
</script>

<template>
  <section class="admin-settings">
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-header__title">{{ t('settings.title') }}</h1>
        <p class="admin-page-header__meta">{{ t('settings.meta') }}</p>
      </div>
    </div>

    <div class="settings-workspace">
      <nav class="settings-tabs" :aria-label="t('settings.domains')">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="settings-tabs__tab"
          :class="{ 'settings-tabs__tab--active': tab.key === activeKey }"
          :data-test="`settings-tab-${tab.key}`"
          :aria-current="tab.key === activeKey ? 'page' : undefined"
          @click="activeKey = tab.key"
        >
          <span class="settings-tabs__label">{{ tab.label }}</span>
          <span class="settings-tabs__summary">{{ tab.description }}</span>
        </button>
      </nav>

      <template v-for="tab in tabs" :key="tab.key">
        <section v-if="tab.key === activeKey" class="settings-body" :aria-labelledby="`settings-title-${tab.key}`">
          <header class="settings-body__header">
            <p class="settings-body__eyebrow">{{ t('settings.title') }}</p>
            <h2 :id="`settings-title-${tab.key}`" class="settings-body__title">{{ tab.label }}</h2>
            <p class="admin-muted settings-body__description">{{ tab.description }}</p>
          </header>

          <div v-if="isEditableDomainTab(tab.key) || tab.key === 'security' || tab.key === 'media'" class="settings-section">
            <SettingsDomainPanel v-if="isEditableDomainTab(tab.key)" :key="tab.key" :domain="tab.key" />
            <SettingsSecurityView v-else-if="tab.key === 'security'" />
            <SettingsMediaForm v-else-if="tab.key === 'media'" />
          </div>

          <DatabaseUpdatePanel v-if="tab.key === 'database'" />

          <section v-if="integrationCapabilities(tab.key).length > 0" class="settings-section settings-section--providers">
            <div class="settings-section__heading">
              <h3>{{ t('settings.providers') }}</h3>
              <p class="admin-muted">{{ t('settings.providersDesc') }}</p>
            </div>
            <IntegrationCenter embedded :capabilities="integrationCapabilities(tab.key)" />
          </section>
          <section v-if="tab.key === 'analytics'" class="settings-section" data-test="analytics-report-settings">
            <div class="settings-section__heading">
              <h3>{{ t('analytics.reportSettingsTitle') }}</h3>
              <p class="admin-muted">{{ t('analytics.reportSettingsDescription') }}</p>
            </div>
            <p v-if="reportPending" class="admin-muted">{{ t('common.loading') }}</p>
            <p v-else-if="reportLoadError" class="admin-alert" data-test="analytics-report-settings-error">{{ apiErrorMessage(reportLoadError, t('analytics.reportLoadError')) }}</p>
            <form class="settings-form" @submit.prevent="saveReportSettings">
              <label class="settings-field settings-field--check">
                <input v-model="reportEnabled" type="checkbox" :disabled="reportPending || Boolean(reportLoadError)">
                <span class="settings-field__label">{{ t('analytics.reportEnabled') }}</span>
              </label>
              <label class="settings-field">
                <span class="settings-field__label">{{ t('analytics.reportSchedule') }}</span>
                <select v-model="reportSchedule" data-test="analytics-report-schedule" class="settings-field__input" :disabled="!reportEnabled || reportPending || Boolean(reportLoadError)">
                  <option value="off">{{ t('analytics.scheduleOff') }}</option>
                  <option value="hourly">{{ t('analytics.scheduleHourly') }}</option>
                  <option value="every6Hours">{{ t('analytics.scheduleEvery6Hours') }}</option>
                  <option value="every12Hours">{{ t('analytics.scheduleEvery12Hours') }}</option>
                  <option value="daily">{{ t('analytics.scheduleDaily') }}</option>
                  <option value="weekly">{{ t('analytics.scheduleWeekly') }}</option>
                </select>
              </label>
              <label v-if="reportSchedule === 'weekly'" class="settings-field">
                <span class="settings-field__label">{{ t('analytics.reportDayOfWeek') }}</span>
                <select v-model="reportDayOfWeek" data-test="analytics-report-weekday" class="settings-field__input" :disabled="!reportEnabled">
                  <option value="mon">{{ t('analytics.weekdayMon') }}</option>
                  <option value="tue">{{ t('analytics.weekdayTue') }}</option>
                  <option value="wed">{{ t('analytics.weekdayWed') }}</option>
                  <option value="thu">{{ t('analytics.weekdayThu') }}</option>
                  <option value="fri">{{ t('analytics.weekdayFri') }}</option>
                  <option value="sat">{{ t('analytics.weekdaySat') }}</option>
                  <option value="sun">{{ t('analytics.weekdaySun') }}</option>
                </select>
              </label>
              <label v-if="reportUsesCalendar" class="settings-field"><span class="settings-field__label">{{ t('analytics.reportTimeOfDay') }}</span><input v-model="reportTimeOfDay" data-test="analytics-report-time" class="settings-field__input" type="time" :disabled="!reportEnabled"></label>
              <label v-if="reportUsesCalendar" class="settings-field">
                <span class="settings-field__label">{{ t('analytics.reportTimezone') }}</span>
                <input v-model="reportTimezone" data-test="analytics-report-timezone" class="settings-field__input" type="text" list="analytics-report-timezones" :disabled="!reportEnabled">
                <datalist id="analytics-report-timezones">
                  <option v-for="timezone in reportTimezones" :key="timezone" :value="timezone" />
                </datalist>
              </label>
              <p v-if="reportData?.data.lastSuccessAt" class="admin-muted">{{ t('analytics.reportLastSuccess', { time: reportData.data.lastSuccessAt }) }}</p>
              <p v-if="reportData?.data.lastError" class="admin-alert">{{ reportData.data.lastError }}</p>
              <p v-if="reportMessage" class="admin-muted" data-test="analytics-report-settings-message">{{ reportMessage }}</p>
              <p v-if="reportSaveError" class="admin-alert" data-test="analytics-report-settings-save-error">{{ reportSaveError }}</p>
              <p v-if="reportRefreshWarning" class="admin-alert" data-test="analytics-report-settings-refresh-warning">{{ reportRefreshWarning }}</p>
              <div class="settings-panel__footer"><button class="settings-panel__sync" type="button" :disabled="reportSyncing || !reportEnabled || reportData?.data.syncSupported !== true" @click="syncReport">{{ reportSyncing ? t('analytics.reportSyncing') : t('analytics.reportSync') }}</button><button class="settings-panel__save" type="submit" :disabled="reportSaving || reportPending || Boolean(reportLoadError)">{{ t('common.save') }}</button></div>
            </form>
          </section>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.admin-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-workspace {
  display: grid;
  grid-template-columns: minmax(190px, 230px) minmax(0, 1fr);
  align-items: start;
  gap: 24px;
}

.settings-tabs {
  display: flex;
  position: sticky;
  top: 20px;
  flex-direction: column;
  gap: 4px;
  padding: 7px;
  border: 1px solid var(--color-line);
  border-radius: 12px;
  background: var(--color-panel);
}

.settings-tabs__tab {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-height: 48px;
  padding: 8px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-muted);
  text-align: start;
  cursor: pointer;
}

.settings-tabs__tab--active {
  background: var(--admin-hover);
  color: var(--color-accent);
  box-shadow: inset 3px 0 0 var(--color-accent);
}

.settings-tabs__tab:not(.settings-tabs__tab--active):hover {
  color: var(--color-text);
  background: var(--admin-subtle);
}

.settings-tabs__label {
  color: inherit;
  font-size: 0.86rem;
  font-weight: 800;
}

.settings-tabs__summary {
  overflow: hidden;
  color: var(--color-muted);
  font-size: 0.7rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-body {
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--color-line);
  border-radius: 14px;
  background: var(--color-panel);
  box-shadow: var(--shadow-card);
}

.settings-body__header {
  margin-bottom: 22px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-line);
}

.settings-body__eyebrow {
  margin: 0 0 3px;
  color: var(--color-accent);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.settings-body__title {
  margin: 0;
  color: var(--color-text);
  font-size: 1.35rem;
}

.settings-body__description {
  margin: 5px 0 0;
}

.settings-section + .settings-section {
  margin-top: 26px;
  padding-top: 22px;
  border-top: 1px solid var(--color-line);
}

.settings-section__heading {
  margin-bottom: 14px;
}

.settings-section__heading h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 1rem;
}

.settings-section__heading p {
  margin: 4px 0 0;
}

:deep(.settings-form) {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 640px;
}

:deep(.settings-field) {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

:deep(.settings-field--check) {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

:deep(.settings-field__label) {
  color: var(--color-text);
  font-size: 0.82rem;
  font-weight: 700;
}

:deep(.settings-field__input) {
  padding: 8px 10px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
}

:deep(.settings-field__code) {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.82rem;
}

:deep(.settings-field__error) {
  color: var(--color-accent-warm);
  font-size: 0.78rem;
}

:deep(.settings-field-row) {
  display: flex;
  gap: 12px;
}

:deep(.settings-field-row) .settings-field {
  flex: 1;
}

:deep(.settings-rows) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

:deep(.settings-rows__row) {
  display: flex;
  gap: 8px;
}

:deep(.settings-rows__row) .settings-field__input {
  flex: 1;
}

:deep(.settings-rows__add),
:deep(.settings-rows__remove) {
  min-height: 32px;
  padding: 5px 11px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: var(--color-panel);
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}

:deep(.settings-rows__add) {
  align-self: flex-start;
}

:deep(.settings-readonly) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  max-width: 640px;
}

:deep(.settings-readonly__row) {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-line);
}

:deep(.settings-readonly__row) dt {
  color: var(--color-muted);
  font-weight: 700;
}

:deep(.settings-readonly__note) {
  margin: 4px 0 0;
}

:deep(.settings-panel__footer) {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

:deep(.settings-panel__sync),
:deep(.settings-panel__save) {
  min-height: 36px;
  padding: 8px 18px;
  border-radius: 8px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

:deep(.settings-panel__sync) {
  border: 1px solid var(--color-line);
  background: var(--color-panel);
  color: var(--color-accent);
}

:deep(.settings-panel__sync):hover:not(:disabled) {
  border-color: var(--color-accent);
  background: rgba(var(--color-accent-rgb), 0.08);
}

:deep(.settings-panel__sync):focus-visible,
:deep(.settings-panel__save):focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--color-accent-rgb), 0.2);
}

:deep(.settings-panel__save) {
  border: 1px solid transparent;
  background: var(--color-accent);
  color: #fff;
}

:deep(.settings-panel__sync):disabled,
:deep(.settings-panel__save):disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

:deep(.settings-panel__saved) {
  margin: 0 0 12px;
  color: var(--admin-success);
  font-size: 0.84rem;
  font-weight: 700;
}

@media (max-width: 860px) {
  .settings-workspace {
    display: block;
  }

  .settings-tabs {
    position: static;
    flex-direction: row;
    margin-bottom: 14px;
    overflow-x: auto;
  }

  .settings-tabs__tab {
    flex: 0 0 auto;
    width: auto;
    min-height: 36px;
    padding-inline: 12px;
  }

  .settings-tabs__tab--active {
    box-shadow: inset 0 -3px 0 var(--color-accent);
  }

  .settings-tabs__summary {
    display: none;
  }
}

@media (max-width: 520px) {
  .settings-body {
    padding: 16px;
  }
}
</style>
