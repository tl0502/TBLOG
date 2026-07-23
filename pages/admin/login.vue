<script setup lang="ts">
import { computed, ref } from 'vue'
import { apiErrorCode, adminLogin } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

definePageMeta({ layout: false, middleware: 'admin' })

// Login is layout:false (no admin shell); still emit noindex for crawlers that reach this URL.
useHead(() => ({
  meta: [{ name: 'robots', content: 'noindex,nofollow', key: 'robots' }]
}))

const route = useRoute()
const username = ref('')
const password = ref('')
const secondFactor = ref('')
const twoFactorRequired = ref(false)
const errorMessage = ref('')
const pending = ref(false)
const { t } = useTblogI18n()

// Only allow internal admin paths as a post-login redirect (no open redirect / protocol-relative).
const redirectTarget = computed(() => {
  const raw = route.query.redirect
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw
  }
  return '/admin'
})

async function submit() {
  errorMessage.value = ''
  pending.value = true
  try {
    await adminLogin({
      username: username.value,
      password: password.value,
      secondFactor: twoFactorRequired.value ? secondFactor.value : undefined
    })
    await navigateTo(redirectTarget.value)
  } catch (error) {
    const code = apiErrorCode(error)
    if (code === 'two_factor_required' || code === 'invalid_two_factor') {
      twoFactorRequired.value = true
      errorMessage.value = code === 'two_factor_required'
        ? t('admin.twoFactorRequired')
        : t('admin.invalidTwoFactor')
    } else if (code === 'ip_access_denied') {
      errorMessage.value = t('admin.ipAccessDenied')
    } else if (code === 'two_factor_unavailable') {
      errorMessage.value = t('admin.twoFactorUnavailable')
    } else if (code === 'login_audit_unavailable') {
      errorMessage.value = t('admin.loginAuditUnavailable')
    } else if (code === 'missing_session_secret' || code === 'invalid_session_secret') {
      errorMessage.value = t(`admin.${code}`)
    } else {
      errorMessage.value = t('admin.invalidCredentials')
    }
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="admin-login">
    <form class="admin-login__card" @submit.prevent="submit">
      <h1 class="admin-login__title">{{ t('admin.title') }}</h1>

      <label class="admin-login__field">
        <span>{{ t('admin.username') }}</span>
        <input v-model="username" type="text" autocomplete="username" required />
      </label>

      <label v-if="twoFactorRequired" class="admin-login__field">
        <span>{{ t('admin.secondFactor') }}</span>
        <input
          v-model="secondFactor"
          type="text"
          autocomplete="one-time-code"
          autocapitalize="characters"
          spellcheck="false"
          minlength="6"
          maxlength="32"
          required
          autofocus
        />
        <small class="admin-login__hint">{{ t('admin.secondFactorHint') }}</small>
      </label>

      <label class="admin-login__field">
        <span>{{ t('admin.password') }}</span>
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>

      <p v-if="errorMessage" class="admin-login__error" role="alert">{{ errorMessage }}</p>

      <button type="submit" class="admin-login__submit" :disabled="pending">
        {{ pending ? t('admin.signingIn') : t('admin.signIn') }}
      </button>
    </form>
  </main>
</template>
