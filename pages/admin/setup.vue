<script setup lang="ts">
import { computed, ref } from 'vue'
import { apiErrorMessage, applyAdminSetupMigrations, setupAdmin } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

definePageMeta({ layout: false, middleware: 'admin' })

const route = useRoute()
const username = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const errorMessage = ref('')
const pending = ref(false)
const { t } = useTblogI18n()

const redirectTarget = computed(() => {
  const raw = route.query.redirect
  if (
    typeof raw === 'string'
    && raw.startsWith('/admin')
    && raw !== '/admin/login'
    && raw !== '/admin/setup'
    && !raw.startsWith('//')
  ) {
    return raw
  }
  return '/admin'
})

async function submit() {
  if (pending.value) return
  errorMessage.value = ''
  if (password.value !== passwordConfirmation.value) {
    errorMessage.value = t('admin.passwordMismatch')
    return
  }

  pending.value = true
  try {
    let migrationResult = await applyAdminSetupMigrations()
    while (migrationResult.data.pending.length > 0) {
      migrationResult = await applyAdminSetupMigrations()
    }
    await setupAdmin({ username: username.value, password: password.value })
    await navigateTo(redirectTarget.value)
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, t('admin.setupError'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="admin-login">
    <form class="admin-login__card" @submit.prevent="submit">
      <h1 class="admin-login__title">{{ t('admin.setupTitle') }}</h1>
      <p class="admin-login__intro">{{ t('admin.setupIntro') }}</p>

      <label class="admin-login__field">
        <span>{{ t('admin.username') }}</span>
        <input v-model="username" type="text" autocomplete="username" minlength="3" maxlength="64" required />
      </label>

      <label class="admin-login__field">
        <span>{{ t('admin.password') }}</span>
        <input v-model="password" type="password" autocomplete="new-password" minlength="12" required />
      </label>

      <label class="admin-login__field">
        <span>{{ t('admin.confirmPassword') }}</span>
        <input v-model="passwordConfirmation" type="password" autocomplete="new-password" minlength="12" required />
      </label>

      <p class="admin-login__hint">{{ t('admin.passwordRequirements') }}</p>
      <p v-if="errorMessage" class="admin-login__error" role="alert">{{ errorMessage }}</p>

      <button type="submit" class="admin-login__submit" :disabled="pending">
        {{ pending ? t('admin.settingUp') : t('admin.completeSetup') }}
      </button>
    </form>
  </main>
</template>
