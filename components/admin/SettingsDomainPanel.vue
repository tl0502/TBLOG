<script setup lang="ts">
import { ref, toRaw } from 'vue'
import SettingsCommentForm from '~/components/admin/SettingsCommentForm.vue'
import SettingsProfileForm from '~/components/admin/SettingsProfileForm.vue'
import SettingsSecurityView from '~/components/admin/SettingsSecurityView.vue'
import SettingsSeoForm from '~/components/admin/SettingsSeoForm.vue'
import SettingsSiteForm from '~/components/admin/SettingsSiteForm.vue'
import {
  apiErrorMessage,
  apiErrorCode,
  fetchSettingsDomain,
  settingsValidationIssues,
  updateSettingsDomain,
  type ProfileSettings,
  type SettingsByDomain,
  type SettingsDomain,
  type SettingsValidationIssue
} from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { publicResourceKey } from '~/composables/useStaleFirstPublicResource'

const props = defineProps<{ domain: SettingsDomain }>()
const { t } = useTblogI18n()

// `security` is displayed read-only; every other domain here is an editable form.
const readOnly = props.domain === 'security'

type ProfileSettingsSection = 'identity' | 'introduction' | 'social' | 'projects' | 'journey'

const profileSectionFields = {
  identity: ['name', 'role', 'avatarUrl', 'shortBio', 'currentStatus', 'location'],
  introduction: ['signature', 'introduction', 'topics'],
  social: ['socialLinks'],
  projects: ['projects'],
  journey: ['journeyEnabled', 'journey']
} as const satisfies Record<ProfileSettingsSection, readonly (keyof ProfileSettings)[]>

const form = ref<SettingsByDomain[SettingsDomain] | null>(null)
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveError = ref('')
const saved = ref(false)
const issues = ref<SettingsValidationIssue[]>([])
const formInvalid = ref(false)
const savingProfileSection = ref<ProfileSettingsSection | null>(null)
const savedProfileSection = ref<ProfileSettingsSection | null>(null)
const profileErrorSection = ref<ProfileSettingsSection | null>(null)
const seoSiteName = ref('TBLOG')
const seoSiteDescription = ref<string | null>(null)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    if (props.domain === 'seo') {
      // Load the SEO config and its auxiliary Site display data concurrently instead of in series.
      // The Site read is tolerant: the SEO form stays usable with safe fallbacks if it fails.
      const [response, site] = await Promise.all([
        fetchSettingsDomain('seo'),
        fetchSettingsDomain('site').catch(() => null)
      ])
      form.value = structuredClone(response.data) as SettingsByDomain[SettingsDomain]
      if (site) {
        seoSiteName.value = site.data.siteName
        seoSiteDescription.value = site.data.description
      }
    } else {
      const response = await fetchSettingsDomain(props.domain)
      form.value = structuredClone(response.data) as SettingsByDomain[SettingsDomain]
    }
  } catch (error) {
    loadError.value = apiErrorMessage(error, t('settings.loadError'))
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!form.value || saving.value || formInvalid.value) {
    return
  }
  saving.value = true
  saveError.value = ''
  saved.value = false
  issues.value = []
  try {
    const response = await updateSettingsDomain(
      props.domain,
      form.value as never
    )
    form.value = structuredClone(response.data) as SettingsByDomain[SettingsDomain]
    saved.value = true
    if (typeof refreshNuxtData === 'function') {
      await refreshNuxtData(publicResourceKey('site-config'))
    }
  } catch (error) {
    issues.value = settingsValidationIssues(error)
    saveError.value = issues.value.length
      ? t('settings.validationError')
      : apiErrorMessage(error, t('settings.saveError'))
  } finally {
    saving.value = false
  }
}

function copyProfileSection(
  target: ProfileSettings,
  source: ProfileSettings,
  section: ProfileSettingsSection
) {
  for (const field of profileSectionFields[section]) {
    Object.assign(target, { [field]: structuredClone(toRaw(source[field])) })
  }
}

function profileSectionMatches(
  current: ProfileSettings,
  submitted: ProfileSettings,
  section: ProfileSettingsSection
) {
  return profileSectionFields[section].every((field) =>
    JSON.stringify(toRaw(current[field])) === JSON.stringify(submitted[field])
  )
}

function markProfileSectionDirty(section: ProfileSettingsSection) {
  if (savedProfileSection.value === section) savedProfileSection.value = null
  if (profileErrorSection.value === section) {
    profileErrorSection.value = null
    saveError.value = ''
    issues.value = []
  }
}

async function saveProfileSection(section: ProfileSettingsSection) {
  if (
    props.domain !== 'profile'
    || !form.value
    || savingProfileSection.value
  ) {
    return
  }

  savingProfileSection.value = section
  savedProfileSection.value = null
  profileErrorSection.value = null
  saveError.value = ''
  issues.value = []

  const draft = form.value as ProfileSettings
  const submitted = structuredClone(toRaw(draft)) as ProfileSettings

  try {
    const latest = await fetchSettingsDomain('profile')
    const payload = structuredClone(latest.data)
    copyProfileSection(payload, submitted, section)
    const response = await updateSettingsDomain('profile', payload, {
      revision: latest.meta.revision ?? null
    })
    if (profileSectionMatches(draft, submitted, section)) {
      copyProfileSection(draft, response.data, section)
      savedProfileSection.value = section
    }
    if (typeof refreshNuxtData === 'function') {
      await refreshNuxtData(publicResourceKey('site-config'))
    }
  } catch (error) {
    issues.value = settingsValidationIssues(error)
    saveError.value = apiErrorCode(error) === 'settings_conflict'
      ? t('settings.profileSaveConflict')
      : issues.value.length
        ? t('settings.validationError')
        : apiErrorMessage(error, t('settings.saveError'))
    profileErrorSection.value = section
  } finally {
    savingProfileSection.value = null
  }
}

// Kick off the initial load; the panel remounts (fresh load) when the active tab changes.
void load()
</script>

<template>
  <div class="settings-panel" :data-test="`settings-panel-${domain}`">
    <p v-if="loading" class="admin-muted" data-test="settings-loading">{{ t('settings.loading') }}</p>

    <p v-else-if="loadError" class="admin-alert" role="alert" data-test="settings-load-error">
      {{ loadError }}
    </p>

    <template v-else-if="form">
      <p v-if="saveError && domain !== 'profile'" class="admin-alert" role="alert" data-test="settings-save-error">
        {{ saveError }}
      </p>
      <p v-if="saved && domain !== 'profile'" class="settings-panel__saved" role="status" data-test="settings-saved">
        {{ t('settings.saved') }}
      </p>

      <SettingsSiteForm v-if="domain === 'site'" :value="(form as any)" :issues="issues" />
      <SettingsProfileForm
        v-else-if="domain === 'profile'"
        :value="(form as any)"
        :issues="issues"
        :saving-section="savingProfileSection"
        :saved-section="savedProfileSection"
        :error-section="profileErrorSection"
        :save-error="saveError"
        @save="saveProfileSection"
        @edit="markProfileSectionDirty"
      />
      <SettingsSeoForm
        v-else-if="domain === 'seo'"
        :value="(form as any)"
        :issues="issues"
        :site-name="seoSiteName"
        :site-description="seoSiteDescription"
      />
      <SettingsCommentForm v-else-if="domain === 'comment'" :value="(form as any)" :issues="issues" />
      <SettingsSecurityView v-else-if="domain === 'security'" :value="(form as any)" />

      <div v-if="!readOnly && domain !== 'profile'" class="settings-panel__footer">
        <button
          type="button"
          class="settings-panel__save"
          data-test="settings-save"
          :disabled="saving || formInvalid"
          @click="save"
        >
          {{ saving ? t('settings.saving') : t('settings.saveChanges') }}
        </button>
      </div>
    </template>
  </div>
</template>
