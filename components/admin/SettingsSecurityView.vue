<script setup lang="ts">
import QRCode from 'qrcode'
import { computed, onMounted, ref, watch } from 'vue'
import {
  apiErrorMessage,
  disableAdminTwoFactor,
  enableAdminTwoFactor,
  fetchAdminLoginAttempts,
  replaceAdminIpRules,
  startAdminTwoFactor,
  updateAdminAccount,
  useAdminSecurity,
  type AdminLoginAttemptView
} from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { adminSessionPolicy } from '~/utils/security-policy'

const { t } = useTblogI18n()
const { data, pending, error, refresh } = useAdminSecurity()
const overview = computed(() => data.value?.data)
const sessionTtlHours = computed(() => Math.round((adminSessionPolicy.ttlSeconds / 3600) * 10) / 10)

const accountUsername = ref('')
const accountCurrentPassword = ref('')
const accountNewPassword = ref('')
const accountConfirmPassword = ref('')
const accountPending = ref(false)
const accountMessage = ref('')
const accountError = ref('')

const setupPassword = ref('')
const enablePassword = ref('')
const setupCode = ref('')
const setupSecret = ref('')
const setupQr = ref('')
const twoFactorPending = ref(false)
const twoFactorMessage = ref('')
const twoFactorError = ref('')
const recoveryCodes = ref<string[]>([])
const recoveryCopyMessage = ref('')
const twoFactorEnabledOverride = ref<boolean | null>(null)
const disablePassword = ref('')
const disableCode = ref('')

const allowRules = ref('')
const denyRules = ref('')
const ipPending = ref(false)
const ipMessage = ref('')
const ipError = ref('')

const attempts = ref<AdminLoginAttemptView[]>([])
const attemptsTotal = ref(0)
const attemptsOffset = ref(0)
const attemptsPending = ref(false)
const attemptsError = ref('')
const attemptsLimit = 25
const overviewRefreshError = ref('')
const attemptsRangeStart = computed(() => attemptsTotal.value === 0
  ? 0
  : Math.min(attemptsOffset.value + 1, attemptsTotal.value))
const attemptsRangeEnd = computed(() => Math.min(attemptsOffset.value + attemptsLimit, attemptsTotal.value))
const twoFactorEnabled = computed(() => twoFactorEnabledOverride.value ?? overview.value?.twoFactor.enabled ?? false)

watch(overview, (value) => {
  if (!value) return
  accountUsername.value = value.account.username
  allowRules.value = value.ipAccess.allow.join('\n')
  denyRules.value = value.ipAccess.deny.join('\n')
}, { immediate: true })

function lines(value: string): string[] {
  return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean)
}

async function refreshOverviewAfterMutation() {
  overviewRefreshError.value = ''
  try {
    await refresh()
    if (error.value) {
      overviewRefreshError.value = t('security.refreshError')
    }
  } catch {
    overviewRefreshError.value = t('security.refreshError')
  }
}

async function saveAccount() {
  accountMessage.value = ''
  accountError.value = ''
  if (accountNewPassword.value !== accountConfirmPassword.value) {
    accountError.value = t('admin.passwordMismatch')
    return
  }
  accountPending.value = true
  try {
    await updateAdminAccount({
      currentPassword: accountCurrentPassword.value,
      username: accountUsername.value,
      password: accountNewPassword.value || undefined
    })
    accountCurrentPassword.value = ''
    accountNewPassword.value = ''
    accountConfirmPassword.value = ''
    accountMessage.value = t('security.accountSaved')
  } catch (caught) {
    accountError.value = apiErrorMessage(caught, t('security.accountSaveError'))
    accountPending.value = false
    return
  }
  await refreshOverviewAfterMutation()
  accountPending.value = false
}

async function startTwoFactor() {
  twoFactorMessage.value = ''
  twoFactorError.value = ''
  recoveryCodes.value = []
  recoveryCopyMessage.value = ''
  twoFactorPending.value = true
  try {
    const result = await startAdminTwoFactor(setupPassword.value)
    setupSecret.value = result.data.secret
    setupQr.value = await QRCode.toDataURL(result.data.otpauthUri, { width: 220, margin: 1 })
    setupPassword.value = ''
  } catch (caught) {
    twoFactorError.value = apiErrorMessage(caught, t('security.twoFactorSetupError'))
  } finally {
    twoFactorPending.value = false
  }
}

async function enableTwoFactor() {
  twoFactorMessage.value = ''
  twoFactorError.value = ''
  recoveryCopyMessage.value = ''
  twoFactorPending.value = true
  try {
    const result = await enableAdminTwoFactor({
      currentPassword: enablePassword.value,
      code: setupCode.value
    })
    recoveryCodes.value = result.data.recoveryCodes
    setupSecret.value = ''
    setupQr.value = ''
    setupCode.value = ''
    enablePassword.value = ''
    twoFactorEnabledOverride.value = true
    twoFactorMessage.value = t('security.twoFactorEnabled')
  } catch (caught) {
    twoFactorError.value = apiErrorMessage(caught, t('security.twoFactorEnableError'))
    twoFactorPending.value = false
    return
  }
  await refreshOverviewAfterMutation()
  twoFactorPending.value = false
}

async function copyRecoveryCodes() {
  recoveryCopyMessage.value = ''
  try {
    await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
    recoveryCopyMessage.value = t('security.recoveryCopied')
  } catch {
    recoveryCopyMessage.value = t('security.recoveryCopyError')
  }
}

async function disableTwoFactor() {
  twoFactorMessage.value = ''
  twoFactorError.value = ''
  twoFactorPending.value = true
  try {
    await disableAdminTwoFactor({
      currentPassword: disablePassword.value,
      secondFactor: disableCode.value
    })
    disablePassword.value = ''
    disableCode.value = ''
    recoveryCodes.value = []
    twoFactorEnabledOverride.value = false
    twoFactorMessage.value = t('security.twoFactorDisabled')
  } catch (caught) {
    twoFactorError.value = apiErrorMessage(caught, t('security.twoFactorDisableError'))
    twoFactorPending.value = false
    return
  }
  await refreshOverviewAfterMutation()
  twoFactorPending.value = false
}

async function saveIpRules() {
  ipMessage.value = ''
  ipError.value = ''
  ipPending.value = true
  try {
    const result = await replaceAdminIpRules({ allow: lines(allowRules.value), deny: lines(denyRules.value) })
    allowRules.value = result.data.allow.join('\n')
    denyRules.value = result.data.deny.join('\n')
    ipMessage.value = t('security.ipSaved')
  } catch (caught) {
    ipError.value = apiErrorMessage(caught, t('security.ipSaveError'))
    ipPending.value = false
    return
  }
  await refreshOverviewAfterMutation()
  ipPending.value = false
}

function attemptReason(reason: string | null): string {
  if (!reason) return t('security.loginSuccess')
  if (reason === 'invalid_credentials') return t('security.reasonCredentials')
  if (reason === 'two_factor_required') return t('security.reasonTwoFactorRequired')
  if (reason === 'invalid_two_factor') return t('security.reasonTwoFactorInvalid')
  if (reason === 'two_factor_unavailable') return t('security.reasonTwoFactorUnavailable')
  if (reason === 'ip_denied') return t('security.reasonIpDenied')
  return reason
}

async function loadAttempts(offset = attemptsOffset.value) {
  attemptsPending.value = true
  attemptsError.value = ''
  try {
    const result = await fetchAdminLoginAttempts(offset, attemptsLimit)
    attempts.value = result.data
    attemptsTotal.value = result.meta.total
    attemptsOffset.value = offset
  } catch (caught) {
    attemptsError.value = apiErrorMessage(caught, t('security.loginHistoryError'))
  } finally {
    attemptsPending.value = false
  }
}

onMounted(() => loadAttempts())
</script>

<template>
  <div class="security-stack" data-test="security-settings">
    <p v-if="pending" class="admin-muted">{{ t('common.loading') }}</p>
    <p v-else-if="error && !overviewRefreshError" class="admin-alert">{{ t('security.loadError') }}</p>
    <p v-if="overviewRefreshError" class="admin-alert" data-test="security-refresh-error" role="alert">{{ overviewRefreshError }}</p>

    <template v-if="overview">
      <section class="security-card">
        <div class="security-card__heading">
          <h3>{{ t('security.accountTitle') }}</h3>
          <p>{{ t('security.accountDesc') }}</p>
        </div>
        <form class="settings-form" data-test="security-account-form" @submit.prevent="saveAccount">
          <label class="settings-field">
            <span class="settings-field__label">{{ t('admin.username') }}</span>
            <input v-model="accountUsername" class="settings-field__input" minlength="3" maxlength="64" required />
          </label>
          <label class="settings-field">
            <span class="settings-field__label">{{ t('security.currentPassword') }}</span>
            <input v-model="accountCurrentPassword" class="settings-field__input" type="password" autocomplete="current-password" required />
          </label>
          <div class="settings-field-row">
            <label class="settings-field">
              <span class="settings-field__label">{{ t('security.newPassword') }}</span>
              <input v-model="accountNewPassword" class="settings-field__input" type="password" autocomplete="new-password" minlength="12" />
            </label>
            <label class="settings-field">
              <span class="settings-field__label">{{ t('admin.confirmPassword') }}</span>
              <input v-model="accountConfirmPassword" class="settings-field__input" type="password" autocomplete="new-password" minlength="12" />
            </label>
          </div>
          <p v-if="accountMessage" class="settings-panel__saved">{{ accountMessage }}</p>
          <p v-if="accountError" class="settings-field__error">{{ accountError }}</p>
          <button class="settings-panel__save" type="submit" :disabled="accountPending">
            {{ accountPending ? t('common.loading') : t('security.saveAccount') }}
          </button>
        </form>
      </section>

      <section class="security-card">
        <div class="security-card__heading">
          <h3>{{ t('security.twoFactorTitle') }}</h3>
          <p>{{ t('security.twoFactorDesc') }}</p>
        </div>
        <p v-if="!overview.twoFactor.available" class="admin-alert">{{ t('security.twoFactorUnavailable') }}</p>
        <form v-else-if="!twoFactorEnabled && !setupSecret" class="settings-form" data-test="security-two-factor-start" @submit.prevent="startTwoFactor">
          <label class="settings-field">
            <span class="settings-field__label">{{ t('security.currentPassword') }}</span>
            <input v-model="setupPassword" class="settings-field__input" type="password" autocomplete="current-password" required />
          </label>
          <button class="settings-panel__save" type="submit" :disabled="twoFactorPending">{{ t('security.startTwoFactor') }}</button>
        </form>
        <form v-else-if="!twoFactorEnabled" class="settings-form" data-test="security-two-factor-enable" @submit.prevent="enableTwoFactor">
          <div class="two-factor-setup">
            <img v-if="setupQr" :src="setupQr" :alt="t('security.qrAlt')" width="220" height="220" />
            <div>
              <p>{{ t('security.scanQr') }}</p>
              <code class="security-secret">{{ setupSecret }}</code>
            </div>
          </div>
          <p class="admin-muted" data-test="security-two-factor-enable-hint">{{ t('security.confirmTwoFactorHint') }}</p>
          <label class="settings-field">
            <span class="settings-field__label">{{ t('security.currentPassword') }}</span>
            <input v-model="enablePassword" class="settings-field__input" type="password" autocomplete="current-password" required />
          </label>
          <label class="settings-field">
            <span class="settings-field__label">{{ t('admin.secondFactor') }}</span>
            <input v-model="setupCode" class="settings-field__input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required />
          </label>
          <button class="settings-panel__save" type="submit" :disabled="twoFactorPending">{{ t('security.confirmTwoFactor') }}</button>
        </form>
        <form v-else class="settings-form" @submit.prevent="disableTwoFactor">
          <p class="security-status security-status--on">{{ t('security.twoFactorOn') }}</p>
          <label class="settings-field">
            <span class="settings-field__label">{{ t('security.currentPassword') }}</span>
            <input v-model="disablePassword" class="settings-field__input" type="password" autocomplete="current-password" required />
          </label>
          <label class="settings-field">
            <span class="settings-field__label">{{ t('admin.secondFactor') }}</span>
            <input v-model="disableCode" class="settings-field__input" autocomplete="one-time-code" required />
          </label>
          <button class="security-danger" type="submit" :disabled="twoFactorPending">{{ t('security.disableTwoFactor') }}</button>
        </form>
        <div v-if="recoveryCodes.length" class="recovery-codes" data-test="security-recovery-codes">
          <strong>{{ t('security.recoveryTitle') }}</strong>
          <p>{{ t('security.recoveryDesc') }}</p>
          <code v-for="code in recoveryCodes" :key="code">{{ code }}</code>
          <button class="settings-panel__save recovery-codes__copy" type="button" data-test="security-copy-recovery" @click="copyRecoveryCodes">
            {{ t('security.copyRecoveryCodes') }}
          </button>
          <p v-if="recoveryCopyMessage" class="settings-panel__saved" data-test="security-recovery-copy-message">{{ recoveryCopyMessage }}</p>
        </div>
        <p v-if="twoFactorMessage" class="settings-panel__saved">{{ twoFactorMessage }}</p>
        <p v-if="twoFactorError" class="settings-field__error">{{ twoFactorError }}</p>
      </section>

      <section class="security-card">
        <div class="security-card__heading">
          <h3>{{ t('security.ipTitle') }}</h3>
          <p>{{ t('security.ipDesc') }}</p>
        </div>
        <p class="admin-muted">{{ t('security.currentIp') }}: <code>{{ overview.ipAccess.currentIp ?? t('security.ipUnknown') }}</code></p>
        <form class="settings-form" data-test="security-ip-form" @submit.prevent="saveIpRules">
          <div class="settings-field-row">
            <label class="settings-field">
              <span class="settings-field__label">{{ t('security.allowList') }}</span>
              <textarea v-model="allowRules" class="settings-field__input security-addresses" rows="6" />
            </label>
            <label class="settings-field">
              <span class="settings-field__label">{{ t('security.denyList') }}</span>
              <textarea v-model="denyRules" class="settings-field__input security-addresses" rows="6" />
            </label>
          </div>
          <p class="admin-muted">{{ t('security.ipHint') }}</p>
          <p v-if="ipMessage" class="settings-panel__saved">{{ ipMessage }}</p>
          <p v-if="ipError" class="settings-field__error">{{ ipError }}</p>
          <button class="settings-panel__save" type="submit" :disabled="ipPending">{{ t('security.saveIpRules') }}</button>
        </form>
      </section>

      <section class="security-card">
        <div class="security-card__heading">
          <h3>{{ t('security.loginHistoryTitle') }}</h3>
          <p>{{ t('security.loginHistoryDesc') }}</p>
        </div>
        <p v-if="attemptsPending" class="admin-muted">{{ t('common.loading') }}</p>
        <p v-if="attemptsError" class="settings-field__error">{{ attemptsError }}</p>
        <div class="security-table-wrap" data-test="security-login-history">
          <table class="security-table">
            <thead><tr><th>{{ t('security.time') }}</th><th>{{ t('admin.username') }}</th><th>IP</th><th>{{ t('security.result') }}</th></tr></thead>
            <tbody>
              <tr v-for="attempt in attempts" :key="attempt.id">
                <td>{{ new Date(attempt.createdAt).toLocaleString() }}</td>
                <td>{{ attempt.username }}</td>
                <td><code>{{ attempt.ipAddress }}</code></td>
                <td :class="attempt.successful ? 'login-ok' : 'login-failed'">{{ attemptReason(attempt.failureReason) }}</td>
              </tr>
              <tr v-if="!attemptsPending && attempts.length === 0"><td colspan="4">{{ t('security.loginHistoryEmpty') }}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="security-pagination">
          <button type="button" :disabled="attemptsOffset === 0 || attemptsPending" @click="loadAttempts(Math.max(0, attemptsOffset - attemptsLimit))">{{ t('moderation.previous') }}</button>
          <span>{{ attemptsRangeStart }}–{{ attemptsRangeEnd }} / {{ attemptsTotal }}</span>
          <button type="button" :disabled="attemptsOffset + attemptsLimit >= attemptsTotal || attemptsPending" @click="loadAttempts(attemptsOffset + attemptsLimit)">{{ t('moderation.next') }}</button>
        </div>
      </section>

      <section class="security-card">
        <dl class="settings-readonly">
          <div class="settings-readonly__row"><dt>{{ t('settings.sessionLifetime') }}</dt><dd>{{ adminSessionPolicy.ttlSeconds }}s ({{ sessionTtlHours }}h)</dd></div>
          <div class="settings-readonly__row"><dt>{{ t('settings.setupLocked') }}</dt><dd>{{ t('settings.automaticAfterSetup') }}</dd></div>
          <div class="settings-readonly__row"><dt>{{ t('settings.allowedOrigins') }}</dt><dd>{{ t('settings.sameOriginOnly') }}</dd></div>
        </dl>
      </section>
    </template>
  </div>
</template>

<style scoped>
.security-stack { display: flex; flex-direction: column; gap: 18px; }
.security-card { padding-bottom: 20px; border-bottom: 1px solid var(--color-line); }
.security-card:last-child { padding-bottom: 0; border-bottom: 0; }
.security-card__heading { margin-bottom: 14px; }
.security-card__heading h3 { margin: 0; font-size: 1rem; color: var(--color-text); }
.security-card__heading p { margin: 4px 0 0; color: var(--color-muted); font-size: .84rem; }
.two-factor-setup { display: flex; align-items: center; gap: 18px; }
.two-factor-setup img { border: 1px solid var(--color-line); border-radius: 10px; background: #fff; }
.security-secret { display: block; max-width: 300px; padding: 8px; overflow-wrap: anywhere; background: var(--color-bg); }
.security-status { margin: 0; font-weight: 700; }
.security-status--on, .login-ok { color: var(--admin-success); }
.security-danger { align-self: flex-start; padding: 8px 16px; border: 1px solid var(--color-accent-warm); border-radius: 8px; background: transparent; color: var(--color-accent-warm); font-weight: 700; cursor: pointer; }
.recovery-codes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; margin-top: 14px; padding: 14px; border: 1px solid var(--color-accent-warm); border-radius: 10px; }
.recovery-codes strong, .recovery-codes p, .recovery-codes__copy { grid-column: 1 / -1; margin: 0; }
.recovery-codes__copy { justify-self: start; }
.security-addresses { resize: vertical; font-family: var(--font-mono, ui-monospace, monospace); }
.security-table-wrap { overflow-x: auto; }
.security-table { width: 100%; border-collapse: collapse; font-size: .8rem; }
.security-table th, .security-table td { padding: 8px; border-bottom: 1px solid var(--color-line); text-align: left; white-space: nowrap; }
.login-failed { color: var(--color-accent-warm); }
.security-pagination { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 12px; font-size: .78rem; }
.security-pagination button { padding: 5px 10px; border: 1px solid var(--color-line); border-radius: 7px; background: var(--color-panel); color: var(--color-text); cursor: pointer; }
.security-pagination button:disabled { opacity: .5; cursor: default; }
@media (max-width: 620px) { .two-factor-setup, :deep(.settings-field-row) { flex-direction: column; align-items: stretch; } .recovery-codes { grid-template-columns: 1fr; } }
</style>
