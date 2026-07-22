<script lang="ts">
import type { IntegrationView } from '~/composables/useAdminApi'

export interface IntegrationSavePayload {
  enabled: boolean
  config: Record<string, unknown>
}
</script>

<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { generateUmamiSelfHostedCredential } from '~/utils/umami-self-hosted-credential'

interface Props {
  integration: IntegrationView
  busy?: boolean
  error?: string
}

const props = withDefaults(defineProps<Props>(), { busy: false, error: '' })
const emit = defineEmits<{
  save: [payload: IntegrationSavePayload]
  action: [actionKey: string]
}>()
const { formatDate, t } = useTblogI18n()

const enabled = shallowRef(props.integration.enabled)
const fields = reactive<Record<string, unknown>>({})
const clientBusy = shallowRef(false)
const clientError = shallowRef('')
const clientResult = shallowRef('')
const copied = shallowRef(false)

function syncFromIntegration(integration: IntegrationView) {
  enabled.value = integration.enabled
  clientError.value = ''
  clientResult.value = ''
  copied.value = false
  for (const key of Object.keys(fields)) {
    delete fields[key]
  }
  for (const meta of integration.formMeta) {
    const raw = integration.config[meta.key]
    if (meta.type === 'boolean') {
      fields[meta.key] = raw === true
    } else {
      fields[meta.key] = typeof raw === 'string' ? raw : raw == null ? '' : String(raw)
    }
  }
}

// Reset the editable form whenever the server view changes (e.g. after a save refresh).
watch(() => props.integration, (next) => syncFromIntegration(next), { immediate: true })

const statusLabel = computed(() => {
  const map: Record<IntegrationView['status'], string> = {
    disabled: t('integrations.disabled'), configured: t('integrations.configured'), active: t('integrations.active'),
    misconfigured: t('integrations.misconfigured'), unavailable: t('integrations.unavailable')
  }
  return map[props.integration.status]
})

const missingSecrets = computed(() => props.integration.missingSecrets)
const missingBindings = computed(() => props.integration.missingBindings)
const hasMissing = computed(() => missingSecrets.value.length > 0 || missingBindings.value.length > 0)

const lastCheckedLabel = computed(() => {
  const value = props.integration.lastCheckedAt
  if (!value) {
    return ''
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : formatDate(date, { dateStyle: 'medium', timeStyle: 'short' })
})

function currentConfig(): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  for (const meta of props.integration.formMeta) {
    if (meta.persist === false) continue
    const value = fields[meta.key]
    if (meta.type === 'boolean') {
      config[meta.key] = value === true
    } else if (typeof value === 'string' && value.trim().length > 0) {
      config[meta.key] = value.trim()
    }
    // Empty optional/text fields are omitted so the server can decide readiness.
  }
  return config
}

function visible(condition?: { key: string; value: string }): boolean {
  return !condition || fields[condition.key] === condition.value
}

async function runAction(action: IntegrationView['actions'][number]) {
  if (action.kind !== 'client') {
    emit('action', action.key)
    return
  }
  if (action.clientHandler !== 'umamiSelfHostedCredential') return

  clientBusy.value = true
  clientError.value = ''
  clientResult.value = ''
  copied.value = false
  try {
    clientResult.value = await generateUmamiSelfHostedCredential({
      apiBaseUrl: typeof fields.apiBaseUrl === 'string' ? fields.apiBaseUrl : '',
      username: typeof fields.credentialUsername === 'string' ? fields.credentialUsername : '',
      password: typeof fields.credentialPassword === 'string' ? fields.credentialPassword : ''
    })
    fields.credentialPassword = ''
  } catch (caught) {
    clientError.value = caught instanceof Error
      ? caught.message
      : t('integrations.credentialGenerationError')
  } finally {
    clientBusy.value = false
  }
}

async function copyClientResult() {
  try {
    await navigator.clipboard.writeText(clientResult.value)
    copied.value = true
  } catch {
    clientError.value = t('integrations.credentialCopyError')
  }
}

function submit() {
  emit('save', { enabled: enabled.value, config: currentConfig() })
}

function fieldLabel(key: string, fallback: string): string {
  if (props.integration.capability === 'analytics') {
    if (key === 'scriptUrl') return t('settings.scriptUrl')
    if (key === 'renderConfigJson') return t('settings.customScriptAttributes')
    if (key === 'siteId') {
      if (props.integration.providerKey === 'cloudflare-web-analytics') return t('settings.analyticsToken')
      if (props.integration.providerKey === 'plausible') return t('settings.analyticsDomain')
      return t('settings.analyticsWebsiteId')
    }
  }
  const keys = {
    appId: 'integrations.field.appId', searchOnlyKey: 'integrations.field.searchOnlyKey', indexName: 'integrations.field.indexName',
    siteKey: 'integrations.field.siteKey', keyPrefix: 'integrations.field.keyPrefix', ttlSeconds: 'integrations.field.ttlSeconds',
    publicBaseUrl: 'integrations.field.publicBaseUrl', thumbnail: 'integrations.field.thumbnail',
    medium: 'integrations.field.medium', large: 'integrations.field.large'
  } as const
  return key in keys ? t(keys[key as keyof typeof keys]) : fallback
}

function actionLabel(key: string, fallback: string): string {
  if (props.integration.capability === 'analytics' && key === 'test') {
    return t('integrations.action.validateConfiguration')
  }
  if (
    key === 'test'
    && (props.integration.providerKey === 'cloudflare-kv' || props.integration.providerKey === 'cloudflare-r2')
  ) {
    return t('integrations.action.checkConfigurationBinding')
  }
  if (key === 'test') return t('integrations.action.test')
  if (key === 'generateCredential') return t('integrations.action.generateCredential')
  if (key === 'resync') return t('integrations.action.resync')
  return fallback
}

function fieldHelp(key: string, fallback: string): string {
  if (props.integration.providerKey === 'cloudflare-kv' && key === 'keyPrefix') return t('integrations.help.kvKeyPrefix')
  if (props.integration.providerKey === 'cloudflare-r2' && key === 'keyPrefix') return t('integrations.help.r2KeyPrefix')
  const keys = {
    appId: 'integrations.help.appId', searchOnlyKey: 'integrations.help.searchOnlyKey', indexName: 'integrations.help.indexName',
    siteKey: 'integrations.help.siteKey', ttlSeconds: 'integrations.help.ttlSeconds', publicBaseUrl: 'integrations.help.publicBaseUrl'
  } as const
  if (key in keys) return t(keys[key as keyof typeof keys])
  if (['thumbnail', 'medium', 'large'].includes(key)) return t('integrations.help.imageTemplate', { variant: fieldLabel(key, key) })
  return fallback
}
</script>

<template>
  <article
    class="integration-card"
    :class="`integration-card--${integration.status}`"
    :data-test="`integration-card-${integration.capability}-${integration.providerKey}`"
  >
    <header class="integration-card__header">
      <div>
        <h3 class="integration-card__title">{{ integration.displayName }}</h3>
        <p class="integration-card__provider">{{ integration.providerKey }}</p>
      </div>
      <span
        class="integration-card__status"
        :class="`integration-card__status--${integration.status}`"
        data-test="integration-status"
      >{{ statusLabel }}</span>
    </header>

    <p
      v-if="hasMissing"
      class="integration-card__missing"
      role="alert"
      data-test="integration-missing"
    >
      {{ t('integrations.missingIntro') }}
      <span v-if="missingSecrets.length">
        {{ t('integrations.missingSecret') }}
        <code v-for="name in missingSecrets" :key="name">{{ name }}</code>.
      </span>
      <span v-if="missingBindings.length">
        {{ t('integrations.missingBinding') }}
        <code v-for="name in missingBindings" :key="name">{{ name }}</code>.
      </span>
      {{ t('integrations.configureCloudflare') }}
    </p>

    <p
      v-if="integration.lastError"
      class="integration-card__error"
      role="alert"
      data-test="integration-last-error"
    >
      {{ integration.lastError }}
    </p>

    <form class="integration-form" @submit.prevent="submit">
      <label class="integration-form__toggle">
        <input
          v-model="enabled"
          type="checkbox"
          data-test="integration-enabled"
          :disabled="busy"
        >
        <span>{{ t('integrations.enabled') }}</span>
      </label>

      <div
        v-for="meta in integration.formMeta"
        v-show="visible(meta.visibleWhen)"
        :key="meta.key"
        class="integration-form__field"
      >
        <label
          class="integration-form__label"
          :for="`field-${integration.capability}-${integration.providerKey}-${meta.key}`"
        >
          {{ fieldLabel(meta.key, meta.label) }}<span v-if="meta.required" class="integration-form__required">*</span>
        </label>

        <input
          v-if="meta.type === 'boolean'"
          :id="`field-${integration.capability}-${integration.providerKey}-${meta.key}`"
          v-model="fields[meta.key]"
          type="checkbox"
          :data-test="`integration-field-${meta.key}`"
          :disabled="busy"
        >
        <select
          v-else-if="meta.type === 'select'"
          :id="`field-${integration.capability}-${integration.providerKey}-${meta.key}`"
          v-model="fields[meta.key]"
          class="integration-form__input"
          :data-test="`integration-field-${meta.key}`"
          :disabled="busy"
        >
          <option value="">—</option>
          <option v-for="option in meta.options ?? []" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <input
          v-else
          :id="`field-${integration.capability}-${integration.providerKey}-${meta.key}`"
          v-model="fields[meta.key]"
          class="integration-form__input"
          :type="meta.type === 'url' ? 'url' : meta.type === 'password' ? 'password' : 'text'"
          :placeholder="meta.placeholder"
          :data-test="`integration-field-${meta.key}`"
          :disabled="busy"
        >

        <p v-if="meta.help" class="integration-form__help">{{ fieldHelp(meta.key, meta.help) }}</p>
      </div>

      <div class="integration-card__actions">
        <button
          type="submit"
          class="integration-card__save"
          data-test="integration-save"
          :disabled="busy"
        >
          {{ busy ? t('settings.saving') : t('common.save') }}
        </button>
        <button
          v-for="action in integration.actions"
          v-show="visible(action.visibleWhen)"
          :key="action.key"
          type="button"
          class="integration-card__action"
          :data-test="`integration-action-${action.key}`"
          :disabled="busy || clientBusy"
          @click="runAction(action)"
        >
          {{ actionLabel(action.key, action.label) }}
        </button>
      </div>
    </form>

    <div v-if="clientResult" class="integration-card__credential" data-test="integration-credential-result">
      <label class="integration-form__label" for="integration-generated-credential">
        {{ t('integrations.generatedCredential') }}
      </label>
      <textarea
        id="integration-generated-credential"
        class="integration-form__input integration-card__credential-output"
        :value="clientResult"
        readonly
        spellcheck="false"
        data-test="integration-credential-output"
      />
      <button
        type="button"
        class="integration-card__action"
        data-test="integration-copy-credential"
        @click="copyClientResult"
      >
        {{ copied ? t('integrations.credentialCopied') : t('integrations.copyCredential') }}
      </button>
      <p class="integration-form__help">{{ t('integrations.generatedCredentialHelp') }}</p>
    </div>

    <p v-if="clientError" class="integration-card__error" role="alert" data-test="integration-client-error">
      {{ clientError }}
    </p>

    <p v-if="error" class="integration-card__error" role="alert" data-test="integration-op-error">
      {{ error }}
    </p>

    <p v-if="lastCheckedLabel" class="integration-card__checked" data-test="integration-last-checked">
      {{ t('integrations.lastChecked', { date: lastCheckedLabel }) }}
    </p>
  </article>
</template>

<style scoped>
.integration-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  background: var(--color-surface, #fff);
  box-shadow: 0 1px 0 rgba(var(--color-text-rgb), 0.025);
}

.integration-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.integration-card__title {
  margin: 0;
  color: var(--color-text);
  font-size: 1.05rem;
}

.integration-card__provider {
  margin: 2px 0 0;
  color: var(--color-muted);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.integration-card__status {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: var(--color-line);
  color: var(--color-muted);
  white-space: nowrap;
}

.integration-card__status--disabled {
  border: 1px solid var(--color-line);
  background: var(--admin-subtle);
  color: var(--color-muted);
}

.integration-card__status--active {
  border: 1px solid rgba(var(--admin-success-rgb), 0.24);
  background: rgba(var(--admin-success-rgb), 0.14);
  color: var(--admin-success);
}

.integration-card__status--configured {
  border: 1px solid rgba(var(--admin-info-rgb), 0.24);
  background: rgba(var(--admin-info-rgb), 0.14);
  color: var(--admin-info);
}

.integration-card__status--misconfigured,
.integration-card__status--unavailable {
  border: 1px solid rgba(var(--color-accent-warm-rgb), 0.25);
  background: rgba(var(--color-accent-warm-rgb), 0.14);
  color: var(--color-accent-warm);
}

.integration-card__missing,
.integration-card__error {
  margin: 0;
  padding: 9px 11px;
  border-inline-start: 3px solid var(--color-accent-warm);
  background: var(--admin-warm-subtle);
  color: var(--color-accent-warm);
  font-size: 0.82rem;
  line-height: 1.5;
}

.integration-card__missing code,
.integration-card__error code {
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(var(--color-accent-warm-rgb), 0.14);
  font-size: 0.78rem;
}

.integration-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.integration-form__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.86rem;
  color: var(--color-text);
}

.integration-form__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.integration-form__label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text);
}

.integration-form__required {
  margin-inline-start: 2px;
  color: var(--color-accent-warm);
}

.integration-form__input {
  padding: 7px 10px;
  border: 1px solid var(--color-line);
  border-radius: 7px;
  background: var(--color-bg, #fff);
  color: var(--color-text);
  font-size: 0.86rem;
}

.integration-form__help {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.76rem;
}

.integration-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.integration-card__credential {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
}

.integration-card__credential-output {
  width: 100%;
  min-height: 92px;
  resize: vertical;
  overflow-wrap: anywhere;
}

.integration-card__save,
.integration-card__action {
  padding: 7px 14px;
  border-radius: 7px;
  border: 1px solid var(--color-line);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.integration-card__save {
  background: var(--color-accent-warm);
  border-color: var(--color-accent-warm);
  color: #fff;
}

.integration-card__save:disabled,
.integration-card__action:disabled {
  opacity: 0.6;
  cursor: default;
}

.integration-card__action {
  background: transparent;
  color: var(--color-text);
}

.integration-card__action:hover {
  border-color: var(--color-accent);
  background: var(--admin-hover);
}

.integration-card__save:hover {
  box-shadow: 0 7px 18px rgba(var(--color-accent-warm-rgb), 0.18);
}

.integration-card__checked {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.74rem;
}
</style>
