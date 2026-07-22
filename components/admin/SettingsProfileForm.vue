<script setup lang="ts">
import { ref } from 'vue'
import ProfileSettingsPreview from '~/components/admin/ProfileSettingsPreview.vue'
import {
  settingsIssueMessage,
  type ProfileJourneyEntry,
  type ProfileProject,
  type ProfileSettings,
  type ProfileSocialLink,
  type SettingsValidationIssue
} from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

type ProfileSettingsSection = 'identity' | 'introduction' | 'social' | 'projects' | 'journey'

const props = withDefaults(defineProps<{
  value: ProfileSettings
  issues: SettingsValidationIssue[]
  savingSection?: ProfileSettingsSection | null
  savedSection?: ProfileSettingsSection | null
  errorSection?: ProfileSettingsSection | null
  saveError?: string
}>(), {
  savingSection: null,
  savedSection: null,
  errorSection: null,
  saveError: ''
})
const emit = defineEmits<{
  save: [section: ProfileSettingsSection]
  edit: [section: ProfileSettingsSection]
}>()
const { t } = useTblogI18n()
const previewOpen = ref(false)
const err = (path: (string | number)[]) => settingsIssueMessage(props.issues, path)

function resequence<T extends { sortOrder: number }>(rows: T[]) {
  rows.forEach((row, index) => { row.sortOrder = index })
}

function move<T extends { sortOrder: number }>(
  rows: T[],
  index: number,
  direction: -1 | 1,
  section: ProfileSettingsSection
) {
  const target = index + direction
  if (target < 0 || target >= rows.length) return
  const current = rows[index]
  const replacement = rows[target]
  if (!current || !replacement) return
  rows[index] = replacement
  rows[target] = current
  resequence(rows)
  emit('edit', section)
}

function remove<T extends { sortOrder: number }>(rows: T[], index: number, section: ProfileSettingsSection) {
  rows.splice(index, 1)
  resequence(rows)
  emit('edit', section)
}

function addTopic() {
  props.value.topics.push('')
  emit('edit', 'introduction')
}

function addSocialLink() {
  const row: ProfileSocialLink = { platform: '', url: '', visible: true, sortOrder: props.value.socialLinks.length }
  props.value.socialLinks.push(row)
  emit('edit', 'social')
}

function addProject() {
  const row: ProfileProject = { name: '', description: '', status: '', tags: [], url: null, visible: true, sortOrder: props.value.projects.length }
  props.value.projects.push(row)
  emit('edit', 'projects')
}

function addJourney() {
  const row: ProfileJourneyEntry = { period: '', title: '', role: '', description: '', visible: true, sortOrder: props.value.journey.length }
  props.value.journey.push(row)
  emit('edit', 'journey')
}

function setProjectTags(project: ProfileProject, event: Event) {
  project.tags = (event.target as HTMLInputElement).value.split(',').map(tag => tag.trim()).filter(Boolean)
}
</script>

<template>
  <div class="settings-form profile-form" data-test="profile-form">
    <div class="profile-form__intro">
      <p class="admin-muted">{{ t('settings.profileEditingHint') }}</p>
      <button type="button" class="profile-form__preview" data-test="profile-open-preview" @click="previewOpen = true">
        {{ t('settings.profileOpenPreview') }} <span>↗</span>
      </button>
    </div>

    <section class="profile-form__section" @input.capture="emit('edit', 'identity')">
      <div class="profile-form__heading"><div><h3>{{ t('settings.profileIdentity') }}</h3><p>{{ t('settings.profileIdentityDesc') }}</p></div><span>01</span></div>
      <div class="settings-field-row">
        <label class="settings-field"><span class="settings-field__label">{{ t('settings.profileName') }}</span><input v-model="value.name" class="settings-field__input" data-test="profile-name"><span v-if="err(['name'])" class="settings-field__error">{{ err(['name']) }}</span></label>
        <label class="settings-field"><span class="settings-field__label">{{ t('settings.profileRole') }}</span><input v-model="value.role" class="settings-field__input" data-test="profile-role"><span v-if="err(['role'])" class="settings-field__error">{{ err(['role']) }}</span></label>
      </div>
      <label class="settings-field"><span class="settings-field__label">{{ t('settings.profileAvatarUrl') }}</span><input v-model="value.avatarUrl" class="settings-field__input" data-test="profile-avatar" placeholder="https://..."><span v-if="err(['avatarUrl'])" class="settings-field__error">{{ err(['avatarUrl']) }}</span></label>
      <label class="settings-field"><span class="settings-field__label">{{ t('settings.profileShortBio') }}</span><textarea v-model="value.shortBio" class="settings-field__input" data-test="profile-short-bio" rows="3" /><span v-if="err(['shortBio'])" class="settings-field__error">{{ err(['shortBio']) }}</span></label>
      <div class="settings-field-row">
        <label class="settings-field"><span class="settings-field__label">{{ t('settings.profileCurrentStatus') }}</span><input v-model="value.currentStatus" class="settings-field__input" data-test="profile-current-status"><span v-if="err(['currentStatus'])" class="settings-field__error">{{ err(['currentStatus']) }}</span></label>
        <label class="settings-field"><span class="settings-field__label">{{ t('settings.profileLocation') }}</span><input v-model="value.location" class="settings-field__input" data-test="profile-location"><span v-if="err(['location'])" class="settings-field__error">{{ err(['location']) }}</span></label>
      </div>
      <div class="profile-form__section-footer">
        <span v-if="errorSection === 'identity'" class="profile-form__save-error" role="alert">{{ saveError }}</span>
        <span v-else-if="savedSection === 'identity'" class="profile-form__saved" role="status">{{ t('settings.saved') }}</span>
        <button type="button" class="profile-form__save" data-test="profile-save-identity" :disabled="savingSection !== null" @click="emit('save', 'identity')">{{ savingSection === 'identity' ? t('settings.saving') : t('common.save') }}</button>
      </div>
    </section>

    <section class="profile-form__section" @input.capture="emit('edit', 'introduction')">
      <div class="profile-form__heading"><div><h3>{{ t('settings.profileVoice') }}</h3><p>{{ t('settings.profileVoiceDesc') }}</p></div><span>02</span></div>
      <label class="settings-field"><span class="settings-field__label">{{ t('settings.profileSignature') }}</span><textarea v-model="value.signature" class="settings-field__input profile-form__signature" data-test="profile-signature" rows="3" /><span class="settings-field__help">{{ t('settings.profileSignatureHint') }}</span><span v-if="err(['signature'])" class="settings-field__error">{{ err(['signature']) }}</span></label>
      <label class="settings-field"><span class="settings-field__label">{{ t('settings.profileIntroduction') }}</span><textarea v-model="value.introduction" class="settings-field__input" data-test="profile-introduction" rows="6" /><span v-if="err(['introduction'])" class="settings-field__error">{{ err(['introduction']) }}</span></label>
      <div class="profile-form__rows">
        <span class="settings-field__label">{{ t('settings.profileTopics') }}</span>
        <div v-for="(topic, index) in value.topics" :key="index" class="profile-form__compact-row">
          <input v-model="value.topics[index]" class="settings-field__input" :data-test="`profile-topic-${index}`" :placeholder="t('settings.profileTopicPlaceholder')">
          <button type="button" class="profile-form__icon-button" :aria-label="t('settings.remove')" @click="value.topics.splice(index, 1); emit('edit', 'introduction')">×</button>
          <span v-if="err(['topics', index])" class="settings-field__error">{{ err(['topics', index]) }}</span>
        </div>
        <button type="button" class="profile-form__add" data-test="profile-add-topic" @click="addTopic">＋ {{ t('settings.profileAddTopic') }}</button>
      </div>
      <div class="profile-form__section-footer">
        <span v-if="errorSection === 'introduction'" class="profile-form__save-error" role="alert">{{ saveError }}</span>
        <span v-else-if="savedSection === 'introduction'" class="profile-form__saved" role="status">{{ t('settings.saved') }}</span>
        <button type="button" class="profile-form__save" data-test="profile-save-introduction" :disabled="savingSection !== null" @click="emit('save', 'introduction')">{{ savingSection === 'introduction' ? t('settings.saving') : t('common.save') }}</button>
      </div>
    </section>

    <section class="profile-form__section" @input.capture="emit('edit', 'social')">
      <div class="profile-form__heading"><div><h3>{{ t('settings.profileSocialLinks') }}</h3><p>{{ t('settings.profileSocialDesc') }}</p></div><span>03</span></div>
      <div v-if="!value.socialLinks.length" class="profile-form__empty">{{ t('settings.profileEmptySocial') }}</div>
      <article v-for="(link, index) in value.socialLinks" :key="index" class="profile-form__item" :data-test="`profile-social-${index}`">
        <div class="profile-form__item-toolbar"><strong>{{ link.platform || t('settings.profileNewSocial') }}</strong><div><label><input v-model="link.visible" type="checkbox"> {{ t('settings.profileVisible') }}</label><button type="button" :disabled="index === 0" @click="move(value.socialLinks,index,-1,'social')">↑</button><button type="button" :disabled="index === value.socialLinks.length - 1" @click="move(value.socialLinks,index,1,'social')">↓</button><button type="button" @click="remove(value.socialLinks,index,'social')">×</button></div></div>
        <div class="settings-field-row"><label class="settings-field"><span class="settings-field__label">{{ t('settings.platform') }}</span><input v-model="link.platform" class="settings-field__input"><span v-if="err(['socialLinks',index,'platform'])" class="settings-field__error">{{ err(['socialLinks',index,'platform']) }}</span></label><label class="settings-field"><span class="settings-field__label">URL</span><input v-model="link.url" class="settings-field__input" placeholder="https://..."><span v-if="err(['socialLinks',index,'url'])" class="settings-field__error">{{ err(['socialLinks',index,'url']) }}</span></label></div>
      </article>
      <button type="button" class="profile-form__add" data-test="profile-add-social" @click="addSocialLink">＋ {{ t('settings.addSocial') }}</button>
      <div class="profile-form__section-footer">
        <span v-if="errorSection === 'social'" class="profile-form__save-error" role="alert">{{ saveError }}</span>
        <span v-else-if="savedSection === 'social'" class="profile-form__saved" role="status">{{ t('settings.saved') }}</span>
        <button type="button" class="profile-form__save" data-test="profile-save-social" :disabled="savingSection !== null" @click="emit('save', 'social')">{{ savingSection === 'social' ? t('settings.saving') : t('common.save') }}</button>
      </div>
    </section>

    <section class="profile-form__section" @input.capture="emit('edit', 'projects')">
      <div class="profile-form__heading"><div><h3>{{ t('settings.profileProjects') }}</h3><p>{{ t('settings.profileProjectsDesc') }}</p></div><span>04</span></div>
      <div v-if="!value.projects.length" class="profile-form__empty">{{ t('settings.profileEmptyProjects') }}</div>
      <article v-for="(project, index) in value.projects" :key="index" class="profile-form__item" :data-test="`profile-project-${index}`">
        <div class="profile-form__item-toolbar"><strong>{{ String(index + 1).padStart(2,'0') }} · {{ project.name || t('settings.profileNewProject') }}</strong><div><label><input v-model="project.visible" type="checkbox"> {{ t('settings.profileVisible') }}</label><button type="button" :disabled="index === 0" @click="move(value.projects,index,-1,'projects')">↑</button><button type="button" :disabled="index === value.projects.length - 1" @click="move(value.projects,index,1,'projects')">↓</button><button type="button" @click="remove(value.projects,index,'projects')">×</button></div></div>
        <div class="settings-field-row"><label class="settings-field"><span class="settings-field__label">{{ t('settings.profileProjectName') }}</span><input v-model="project.name" class="settings-field__input"><span v-if="err(['projects',index,'name'])" class="settings-field__error">{{ err(['projects',index,'name']) }}</span></label><label class="settings-field"><span class="settings-field__label">{{ t('settings.profileProjectStatus') }}</span><input v-model="project.status" class="settings-field__input"></label></div>
        <label class="settings-field"><span class="settings-field__label">{{ t('settings.description') }}</span><textarea v-model="project.description" class="settings-field__input" rows="3" /><span v-if="err(['projects',index,'description'])" class="settings-field__error">{{ err(['projects',index,'description']) }}</span></label>
        <div class="settings-field-row"><label class="settings-field"><span class="settings-field__label">{{ t('settings.profileProjectTags') }}</span><input :value="project.tags.join(', ')" class="settings-field__input" :placeholder="t('settings.profileTagsHint')" @input="setProjectTags(project,$event)"></label><label class="settings-field"><span class="settings-field__label">URL</span><input v-model="project.url" class="settings-field__input" placeholder="https://..."></label></div>
      </article>
      <button type="button" class="profile-form__add" data-test="profile-add-project" @click="addProject">＋ {{ t('settings.profileAddProject') }}</button>
      <div class="profile-form__section-footer">
        <span v-if="errorSection === 'projects'" class="profile-form__save-error" role="alert">{{ saveError }}</span>
        <span v-else-if="savedSection === 'projects'" class="profile-form__saved" role="status">{{ t('settings.saved') }}</span>
        <button type="button" class="profile-form__save" data-test="profile-save-projects" :disabled="savingSection !== null" @click="emit('save', 'projects')">{{ savingSection === 'projects' ? t('settings.saving') : t('common.save') }}</button>
      </div>
    </section>

    <section class="profile-form__section" @input.capture="emit('edit', 'journey')">
      <div class="profile-form__heading"><div><h3>{{ t('settings.profileJourney') }}</h3><p>{{ t('settings.profileJourneyDesc') }}</p></div><span>05</span></div>
      <label class="profile-form__switch"><input v-model="value.journeyEnabled" type="checkbox" data-test="profile-journey-enabled"><span><strong>{{ t('settings.profileJourneyEnabled') }}</strong><small>{{ t('settings.profileJourneyOptional') }}</small></span></label>
      <template v-if="value.journeyEnabled">
        <div v-if="!value.journey.length" class="profile-form__empty">{{ t('settings.profileEmptyJourney') }}</div>
        <article v-for="(entry, index) in value.journey" :key="index" class="profile-form__item">
          <div class="profile-form__item-toolbar"><strong>{{ entry.period || t('settings.profileNewJourney') }}</strong><div><label><input v-model="entry.visible" type="checkbox"> {{ t('settings.profileVisible') }}</label><button type="button" :disabled="index === 0" @click="move(value.journey,index,-1,'journey')">↑</button><button type="button" :disabled="index === value.journey.length - 1" @click="move(value.journey,index,1,'journey')">↓</button><button type="button" @click="remove(value.journey,index,'journey')">×</button></div></div>
          <div class="settings-field-row"><label class="settings-field"><span class="settings-field__label">{{ t('settings.profileJourneyPeriod') }}</span><input v-model="entry.period" class="settings-field__input"></label><label class="settings-field"><span class="settings-field__label">{{ t('settings.profileJourneyTitle') }}</span><input v-model="entry.title" class="settings-field__input"></label></div>
          <label class="settings-field"><span class="settings-field__label">{{ t('settings.profileJourneyRole') }}</span><input v-model="entry.role" class="settings-field__input"></label>
          <label class="settings-field"><span class="settings-field__label">{{ t('settings.description') }}</span><textarea v-model="entry.description" class="settings-field__input" rows="3" /></label>
        </article>
        <button type="button" class="profile-form__add" data-test="profile-add-journey" @click="addJourney">＋ {{ t('settings.profileAddJourney') }}</button>
      </template>
      <div class="profile-form__section-footer">
        <span v-if="errorSection === 'journey'" class="profile-form__save-error" role="alert">{{ saveError }}</span>
        <span v-else-if="savedSection === 'journey'" class="profile-form__saved" role="status">{{ t('settings.saved') }}</span>
        <button type="button" class="profile-form__save" data-test="profile-save-journey" :disabled="savingSection !== null" @click="emit('save', 'journey')">{{ savingSection === 'journey' ? t('settings.saving') : t('common.save') }}</button>
      </div>
    </section>

    <ProfileSettingsPreview v-if="previewOpen" :profile="value" @close="previewOpen = false" />
  </div>
</template>

<style scoped>
.profile-form { max-width: 860px !important; }.profile-form__intro { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px 14px; border: 1px solid var(--color-line); border-radius: 10px; background: var(--admin-subtle); }.profile-form__intro p { margin: 0; }.profile-form__preview { flex: 0 0 auto; padding: 7px 12px; border: 1px solid var(--color-line); border-radius: 8px; background: var(--color-panel); color: var(--color-accent); font-weight: 750; cursor: pointer; }.profile-form__preview span { margin-left: 5px; }
.profile-form__section { padding: 21px; border: 1px solid var(--color-line); border-radius: 12px; background: color-mix(in srgb,var(--color-panel) 94%,var(--color-bg)); }.profile-form__heading { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; padding-bottom: 13px; border-bottom: 1px solid var(--color-line); }.profile-form__heading h3 { margin: 0; font-size: .98rem; }.profile-form__heading p { margin: 4px 0 0; color: var(--color-muted); font-size: .76rem; }.profile-form__heading>span { color: var(--color-accent); font: 700 .7rem var(--font-mono,monospace); }.settings-field__help { color: var(--color-muted); font-size: .73rem; }.profile-form__signature { font-family: var(--font-display); font-size: 1.05rem; line-height: 1.55; }
.profile-form__rows { display: flex; flex-direction: column; gap: 8px; }.profile-form__compact-row { display: grid; grid-template-columns: 1fr 34px; gap: 7px; }.profile-form__compact-row .settings-field__error { grid-column: 1 / -1; }.profile-form__icon-button,.profile-form__item-toolbar button { border: 0; background: transparent; color: var(--color-muted); cursor: pointer; }.profile-form__add { align-self: flex-start; padding: 7px 10px; border: 1px dashed var(--color-line); border-radius: 8px; background: transparent; color: var(--color-accent); font-size: .78rem; font-weight: 750; cursor: pointer; }.profile-form__empty { padding: 15px; border: 1px dashed var(--color-line); border-radius: 9px; color: var(--color-muted); font-size: .78rem; text-align: center; }
.profile-form__item { display: flex; flex-direction: column; gap: 12px; padding: 15px; border: 1px solid var(--color-line); border-radius: 10px; background: var(--color-panel); }.profile-form__item+.profile-form__item { margin-top: 10px; }.profile-form__item-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.profile-form__item-toolbar strong { font-size: .82rem; }.profile-form__item-toolbar>div { display: flex; align-items: center; gap: 4px; }.profile-form__item-toolbar label { margin-right: 6px; color: var(--color-muted); font-size: .72rem; }.profile-form__item-toolbar button { width: 27px; height: 27px; border-radius: 6px; }.profile-form__item-toolbar button:hover { color: var(--color-text); background: var(--admin-hover); }.profile-form__item-toolbar button:disabled { opacity: .3; cursor: default; }.profile-form__switch { display: flex; align-items: flex-start; gap: 10px; padding: 13px; border-radius: 9px; background: var(--admin-subtle); }.profile-form__switch input { margin-top: 3px; }.profile-form__switch span { display: flex; flex-direction: column; gap: 3px; }.profile-form__switch strong { font-size: .82rem; }.profile-form__switch small { color: var(--color-muted); line-height: 1.45; }
.profile-form__section-footer { display: flex; min-height: 36px; margin-top: 18px; padding-top: 14px; align-items: center; justify-content: flex-end; gap: 12px; border-top: 1px solid var(--color-line); }.profile-form__save { min-width: 78px; min-height: 34px; padding: 7px 16px; border: 0; border-radius: 8px; background: var(--color-accent); color: #fff; font-weight: 750; cursor: pointer; }.profile-form__save:disabled { opacity: .55; cursor: not-allowed; }.profile-form__saved { color: var(--admin-success); font-size: .78rem; font-weight: 700; }.profile-form__save-error { margin-right: auto; color: var(--color-accent-warm); font-size: .78rem; }
@media (max-width: 640px) { .profile-form__intro,.profile-form__item-toolbar { align-items: stretch; flex-direction: column; }.profile-form__intro button { align-self: flex-start; }.profile-form__section { padding: 16px; }.settings-field-row { flex-direction: column; }.profile-form__item-toolbar>div { justify-content: flex-end; } }
</style>
