<script setup lang="ts">
import { computed } from 'vue'
import { settingsIssueMessage, type SeoSettings, type SettingsValidationIssue } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

const props = withDefaults(defineProps<{
  value: SeoSettings
  issues: SettingsValidationIssue[]
  siteName?: string
  siteDescription?: string | null
}>(), { siteName: 'TBLOG', siteDescription: null })
const err = (path: (string | number)[]) => settingsIssueMessage(props.issues, path)
const { t } = useTblogI18n()
const previewTitle = computed(() => props.value.defaultTitle || props.siteName)
const previewDescription = computed(() =>
  props.value.defaultDescription || props.siteDescription || t('settings.previewNoDescription')
)
const previewCanonical = computed(() =>
  (props.value.canonicalBaseUrl || (typeof window === 'undefined' ? 'https://example.com' : window.location.origin))
    .replace(/\/+$/, '')
)
const robotsOptions = [
  { value: 'index,follow', label: 'index, follow' },
  { value: 'index,nofollow', label: 'index, nofollow' },
  { value: 'noindex,follow', label: 'noindex, follow' },
  { value: 'noindex,nofollow', label: 'noindex, nofollow' }
]
</script>

<template>
  <div class="settings-form">
    <label class="settings-field">
      <span class="settings-field__label">{{ t('settings.defaultTitle') }}</span>
      <input v-model="value.defaultTitle" data-test="seo-default-title" class="settings-field__input">
      <span v-if="err(['defaultTitle'])" class="settings-field__error">{{ err(['defaultTitle']) }}</span>
    </label>

    <label class="settings-field">
      <span class="settings-field__label">{{ t('settings.defaultDescription') }}</span>
      <textarea v-model="value.defaultDescription" data-test="seo-default-description" class="settings-field__input" rows="2" />
      <span v-if="err(['defaultDescription'])" class="settings-field__error">{{ err(['defaultDescription']) }}</span>
    </label>

    <label class="settings-field">
      <span class="settings-field__label">{{ t('settings.canonical') }}</span>
      <input v-model="value.canonicalBaseUrl" data-test="seo-canonical" class="settings-field__input" placeholder="https://example.com">
      <span v-if="err(['canonicalBaseUrl'])" class="settings-field__error">{{ err(['canonicalBaseUrl']) }}</span>
    </label>

    <label class="settings-field">
      <span class="settings-field__label">{{ t('settings.robots') }}</span>
      <select v-model="value.robotsPolicy" data-test="seo-robots" class="settings-field__input">
        <option v-for="option in robotsOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <span v-if="err(['robotsPolicy'])" class="settings-field__error">{{ err(['robotsPolicy']) }}</span>
      <span class="admin-muted">{{ t('settings.robotsHint') }}</span>
    </label>

    <label class="settings-field settings-field--check">
      <input v-model="value.rssEnabled" data-test="seo-rss" type="checkbox">
      <span class="settings-field__label">{{ t('settings.rss') }}</span>
    </label>

    <label class="settings-field settings-field--check">
      <input v-model="value.sitemapEnabled" data-test="seo-sitemap" type="checkbox">
      <span class="settings-field__label">{{ t('settings.sitemap') }}</span>
    </label>

    <section class="seo-preview" data-test="seo-preview">
      <span class="settings-field__label">{{ t('settings.searchPreview') }}</span>
      <div class="seo-preview__card">
        <p class="seo-preview__title">{{ previewTitle }}</p>
        <p class="seo-preview__url">{{ previewCanonical }}/</p>
        <p class="seo-preview__description">{{ previewDescription }}</p>
      </div>
      <code class="seo-preview__html">&lt;title&gt;{{ previewTitle }}&lt;/title&gt;
&lt;meta name="description" content="{{ previewDescription }}"&gt;
&lt;link rel="canonical" href="{{ previewCanonical }}/"&gt;
&lt;meta name="robots" content="{{ value.robotsPolicy }}"&gt;</code>
      <p class="admin-muted">{{ t('settings.seoPrecedence') }}</p>
    </section>
  </div>
</template>

<style scoped>
.seo-preview { display: flex; flex-direction: column; gap: 8px; }
.seo-preview__card { padding: 14px 16px; border: 1px solid var(--color-line); border-radius: 10px; color-scheme: light; background: #fff; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.025); }
.seo-preview__title { margin: 0; color: #1a0dab; font-size: 1.1rem; }
.seo-preview__url { margin: 4px 0; color: #188038; font-size: 0.78rem; overflow-wrap: anywhere; }
.seo-preview__description { margin: 0; color: #4d5156; font-size: 0.84rem; line-height: 1.45; }
.seo-preview__html { display: block; padding: 12px; border-radius: 8px; background: var(--color-panel); white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
