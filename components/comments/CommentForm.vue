<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import TurnstileWidget from '~/components/comments/TurnstileWidget.vue'
import type { SubmitCommentBody } from '~/composables/usePublicApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

const emit = defineEmits<{
  submit: [body: SubmitCommentBody]
}>()

const form = reactive({
  nickname: '',
  email: '',
  content: ''
})
const { t } = useTblogI18n()
const props = defineProps<{
  submitting: boolean
  turnstileSiteKey?: string | null
}>()
const protectionToken = ref('')
const protectionWidgetKey = ref(0)
const protectionRequired = computed(() => Boolean(props.turnstileSiteKey))

function handleSubmit() {
  const nickname = form.nickname.trim()
  const email = form.email.trim()
  const content = form.content.trim()

  if (!nickname || !content || (protectionRequired.value && !protectionToken.value)) return

  emit('submit', {
    nickname,
    email: email || undefined,
    content,
    protectionToken: protectionToken.value || undefined
  })
  if (protectionRequired.value) {
    // Turnstile tokens are single-use, including failed server verifications. Recreate the widget
    // immediately after handing the token to the parent so a retry cannot reuse stale proof.
    protectionToken.value = ''
    protectionWidgetKey.value += 1
  }
}
</script>

<template>
  <form class="comment-form" :aria-busy="submitting" @submit.prevent="handleSubmit">
    <div class="comment-form__field">
      <label class="comment-form__label" for="comment-nickname">{{ t('comments.nickname') }}</label>
      <input
        id="comment-nickname"
        v-model="form.nickname"
        class="comment-form__control"
        data-test="comment-nickname"
        name="nickname"
        type="text"
        autocomplete="nickname"
        maxlength="80"
        required
        :disabled="submitting"
      >
    </div>

    <div class="comment-form__field">
      <label class="comment-form__label" for="comment-email">
        {{ t('comments.email') }} <span class="comment-form__optional">{{ t('comments.emailOptional') }}</span>
      </label>
      <input
        id="comment-email"
        v-model="form.email"
        class="comment-form__control"
        data-test="comment-email"
        name="email"
        type="email"
        autocomplete="email"
        maxlength="254"
        :disabled="submitting"
      >
    </div>

    <div class="comment-form__field comment-form__field--wide">
      <label class="comment-form__label" for="comment-content">{{ t('comments.comment') }}</label>
      <textarea
        id="comment-content"
        v-model="form.content"
        class="comment-form__control comment-form__textarea"
        data-test="comment-content"
        name="content"
        rows="5"
        maxlength="5000"
        required
        :disabled="submitting"
      />
    </div>

    <div class="comment-form__actions">
      <TurnstileWidget
        v-if="props.turnstileSiteKey"
        :key="protectionWidgetKey"
        class="comment-form__turnstile"
        :site-key="props.turnstileSiteKey"
        @verified="protectionToken = $event"
        @expired="protectionToken = ''"
        @error="protectionToken = ''"
      />
      <p class="comment-form__note">{{ t('comments.reviewNote') }}</p>
      <button
        class="comment-form__submit"
        data-test="comment-submit"
        type="submit"
        :disabled="submitting || (protectionRequired && !protectionToken)"
      >
        {{ submitting ? t('comments.submitting') : t('comments.submit') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.comment-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 17px;
  padding: clamp(20px, 3vw, 28px);
  border: 1px solid rgba(var(--color-accent-rgb), 0.14);
  border-radius: 20px;
  background: rgba(var(--color-panel-rgb), 0.46);
  box-shadow: 0 16px 38px rgba(var(--color-text-rgb), 0.055);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.comment-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.comment-form__field--wide,
.comment-form__actions {
  grid-column: 1 / -1;
}

.comment-form__label {
  color: var(--color-text);
  font-size: 0.75rem;
  font-weight: 700;
}

.comment-form__optional {
  color: var(--color-muted);
  font-weight: 400;
}

.comment-form__control {
  width: 100%;
  padding: 11px 13px;
  border: 1px solid rgba(var(--color-accent-rgb), 0.18);
  border-radius: 12px;
  background: var(--color-field);
  color: var(--color-text);
  font: inherit;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.comment-form__textarea {
  min-height: 132px;
  line-height: 1.6;
  resize: vertical;
}

.comment-form__control:focus-visible,
.comment-form__submit:focus-visible {
  outline: none;
}

.comment-form__turnstile { flex-basis: 100%; }

.comment-form__control:focus-visible {
  border-color: rgba(var(--color-accent-warm-rgb), 0.52);
  background: var(--color-panel-strong);
  box-shadow: 0 0 0 3px rgba(var(--color-accent-warm-rgb), 0.08);
}

.comment-form__control:disabled {
  opacity: 0.72;
}

.comment-form__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.comment-form__note {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.74rem;
}

.comment-form__submit {
  min-height: 42px;
  padding: 9px 17px;
  border: 0;
  border-radius: 999px;
  background: var(--color-accent-warm);
  box-shadow: 0 9px 20px rgba(var(--color-text-rgb), 0.17);
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.comment-form__submit:hover:not(:disabled) {
  box-shadow: 0 12px 24px rgba(var(--color-text-rgb), 0.24);
  transform: translateY(-1px);
}

.comment-form__submit:focus-visible {
  box-shadow: 0 0 0 3px rgba(var(--color-accent-warm-rgb), 0.2), 0 9px 20px rgba(var(--color-text-rgb), 0.17);
}

.comment-form__submit:disabled {
  cursor: default;
  opacity: 0.62;
}

@media (max-width: 640px) {
  .comment-form {
    grid-template-columns: 1fr;
    padding: 18px;
  }

  .comment-form__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .comment-form__submit {
    width: 100%;
  }
}
</style>
