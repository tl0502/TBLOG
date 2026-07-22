<script setup lang="ts">
import { settingsIssueMessage, type SettingsValidationIssue, type SiteSettings } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

const props = defineProps<{ value: SiteSettings; issues: SettingsValidationIssue[] }>()
const err = (path: (string | number)[]) => settingsIssueMessage(props.issues, path)
const { t } = useTblogI18n()

function addNavItem() {
  props.value.navigation.push({ label: '', href: '' })
}
function removeNavItem(index: number) {
  props.value.navigation.splice(index, 1)
}
function addSocialLink() {
  props.value.socialLinks.push({ platform: '', url: '' })
}
function removeSocialLink(index: number) {
  props.value.socialLinks.splice(index, 1)
}
</script>

<template>
  <div class="settings-form">
    <label class="settings-field">
      <span class="settings-field__label">{{ t('settings.siteName') }}</span>
      <input v-model="value.siteName" data-test="site-name" class="settings-field__input">
      <span v-if="err(['siteName'])" class="settings-field__error" data-test="site-name-error">{{ err(['siteName']) }}</span>
    </label>

    <label class="settings-field">
      <span class="settings-field__label">{{ t('settings.description') }}</span>
      <textarea v-model="value.description" data-test="site-description" class="settings-field__input" rows="2" />
      <span v-if="err(['description'])" class="settings-field__error">{{ err(['description']) }}</span>
    </label>

    <label class="settings-field">
      <span class="settings-field__label">{{ t('settings.logoUrl') }}</span>
      <input v-model="value.logoUrl" data-test="site-logo" class="settings-field__input">
      <span v-if="err(['logoUrl'])" class="settings-field__error">{{ err(['logoUrl']) }}</span>
    </label>

    <label class="settings-field">
      <span class="settings-field__label">精选文章兜底封面</span>
      <input v-model="value.featuredFallbackCover" data-test="site-featured-fallback-cover" class="settings-field__input" placeholder="https://...">
      <span class="admin-muted">精选文章没有封面图时使用，仅支持 HTTP(S) 图片 URL。R2 Storage 启用后可使用 R2 返回的公开 URL。</span>
      <span v-if="err(['featuredFallbackCover'])" class="settings-field__error">{{ err(['featuredFallbackCover']) }}</span>
    </label>

    <label class="settings-field">
      <span class="settings-field__label">{{ t('settings.lightTheme') }}</span>
      <select v-model="value.lightTheme" data-test="site-light-theme" class="settings-field__input">
        <option value="default">{{ t('settings.lightThemeDefault') }}</option>
        <option value="atelier">{{ t('settings.lightThemeAtelier') }}</option>
      </select>
      <span class="admin-muted">{{ t('settings.lightThemeHint') }}</span>
      <span v-if="err(['lightTheme'])" class="settings-field__error" data-test="site-light-theme-error">
        {{ err(['lightTheme']) }}
      </span>
    </label>

    <div class="settings-field-row">
      <label class="settings-field">
        <span class="settings-field__label">{{ t('settings.locale') }}</span>
        <input v-model="value.locale" data-test="site-locale" class="settings-field__input">
        <span v-if="err(['locale'])" class="settings-field__error">{{ err(['locale']) }}</span>
      </label>
      <label class="settings-field">
        <span class="settings-field__label">{{ t('settings.timezone') }}</span>
        <input v-model="value.timezone" data-test="site-timezone" class="settings-field__input">
        <span v-if="err(['timezone'])" class="settings-field__error">{{ err(['timezone']) }}</span>
      </label>
    </div>

    <div class="settings-rows" data-test="site-navigation">
      <span class="settings-field__label">{{ t('settings.navigation') }}</span>
      <p v-if="value.navigation.length === 0" class="admin-muted">{{ t('settings.noNavigation') }}</p>
      <div v-for="(item, index) in value.navigation" :key="index" class="settings-rows__row" :data-test="`nav-row-${index}`">
        <input v-model="item.label" :data-test="`nav-label-${index}`" class="settings-field__input" :placeholder="t('settings.label')">
        <input v-model="item.href" :data-test="`nav-href-${index}`" class="settings-field__input" :placeholder="t('settings.path')">
        <button type="button" class="settings-rows__remove" :data-test="`nav-remove-${index}`" @click="removeNavItem(index)">
          {{ t('settings.remove') }}
        </button>
      </div>
      <button type="button" class="settings-rows__add" data-test="nav-add" @click="addNavItem">
        {{ t('settings.addNavigation') }}
      </button>
    </div>

    <div class="settings-rows" data-test="site-social">
      <span class="settings-field__label">{{ t('settings.socialLinks') }}</span>
      <p v-if="value.socialLinks.length === 0" class="admin-muted">{{ t('settings.noSocial') }}</p>
      <div v-for="(link, index) in value.socialLinks" :key="index" class="settings-rows__row" :data-test="`social-row-${index}`">
        <input v-model="link.platform" :data-test="`social-platform-${index}`" class="settings-field__input" :placeholder="t('settings.platform')">
        <input v-model="link.url" :data-test="`social-url-${index}`" class="settings-field__input" placeholder="https://...">
        <button type="button" class="settings-rows__remove" :data-test="`social-remove-${index}`" @click="removeSocialLink(index)">
          {{ t('settings.remove') }}
        </button>
      </div>
      <button type="button" class="settings-rows__add" data-test="social-add" @click="addSocialLink">
        {{ t('settings.addSocial') }}
      </button>
    </div>
  </div>
</template>
