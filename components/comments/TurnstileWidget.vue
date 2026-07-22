<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const props = defineProps<{ siteKey: string }>()
const emit = defineEmits<{
  verified: [token: string]
  expired: []
  error: []
}>()
const { t } = useTblogI18n()
const container = ref<HTMLElement | null>(null)
const loadFailed = ref(false)
let widgetId: string | null = null
let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-tblog-turnstile]')
    const script = existing ?? document.createElement('script')
    const onLoad = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile unavailable'))
    script.addEventListener('load', onLoad, { once: true })
    script.addEventListener('error', () => reject(new Error('Turnstile failed to load')), { once: true })
    if (!existing) {
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.defer = true
      script.dataset.tblogTurnstile = 'true'
      document.head.appendChild(script)
    }
  })
  return scriptPromise
}

async function renderWidget() {
  if (!container.value || !props.siteKey) return
  loadFailed.value = false
  try {
    const api = await loadTurnstile()
    if (!container.value) return
    if (widgetId) api.remove(widgetId)
    widgetId = api.render(container.value, {
      sitekey: props.siteKey,
      action: 'comment',
      theme: 'auto',
      size: 'flexible',
      callback: (token: string) => emit('verified', token),
      'expired-callback': () => emit('expired'),
      'error-callback': () => emit('error')
    })
  } catch {
    loadFailed.value = true
    emit('error')
  }
}

watch(() => props.siteKey, () => void renderWidget())
onMounted(() => void renderWidget())
onBeforeUnmount(() => {
  if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
})
</script>

<template>
  <div class="turnstile-widget">
    <div ref="container" data-test="turnstile-container" />
    <p v-if="loadFailed" class="turnstile-widget__error" role="alert">
      {{ t('comments.protectionLoadError') }}
    </p>
  </div>
</template>

<style scoped>
.turnstile-widget { min-height: 65px; }
.turnstile-widget__error { margin: 6px 0 0; color: var(--color-accent-warm); font-size: 0.78rem; }
</style>
