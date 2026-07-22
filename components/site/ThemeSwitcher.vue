<script setup lang="ts">
import { computed } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { colorModePreferences, useTblogTheme } from '~/composables/useTblogTheme'

const { preference, resolvedColorMode, setColorMode } = useTblogTheme()
const { t } = useTblogI18n()
const nextMode = computed(() => {
  const index = colorModePreferences.indexOf(preference.value)
  return colorModePreferences[(index + 1) % colorModePreferences.length] ?? 'system'
})
const label = computed(() => t(`theme.${nextMode.value}`))
</script>

<template>
  <div class="theme-switcher">
    <button
      type="button"
      class="theme-switcher__button"
      :aria-label="label"
      :title="label"
      :data-color-mode="preference"
      :data-resolved-color-mode="resolvedColorMode"
      data-test="theme-toggle"
      @click="setColorMode(nextMode)"
    >
      <svg v-if="preference === 'system'" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8.5 21h7M12 17v4" />
      </svg>
      <svg v-else-if="preference === 'light'" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.5 15.2A8.5 8.5 0 0 1 8.8 4.5a8.5 8.5 0 1 0 10.7 10.7Z" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.theme-switcher {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  margin-inline-start: 6px;
}

.theme-switcher__button {
  display: inline-grid;
  width: 32px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: var(--color-muted);
  background: transparent;
  cursor: pointer;
  place-items: center;
  transition: color 0.18s ease, background 0.18s ease;
}

.theme-switcher__button:hover {
  color: var(--color-accent-warm);
  background: rgba(var(--color-accent-rgb), 0.08);
}

.theme-switcher__button:focus-visible {
  outline: 2px solid var(--color-accent-warm);
  outline-offset: 1px;
}

.theme-switcher__button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.65;
}
</style>
