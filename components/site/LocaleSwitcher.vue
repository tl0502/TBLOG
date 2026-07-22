<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { supportedLocales, type AppLocale } from '~/i18n/messages'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { useTblogTheme } from '~/composables/useTblogTheme'

const { locale, setLocale, t } = useTblogI18n()
const { resolvedTheme } = useTblogTheme()
const open = ref(false)
const rootRef = useTemplateRef<HTMLElement>('root')
const menuRef = useTemplateRef<HTMLElement>('menu')
const menuStyle = ref<Record<string, string>>({})

function localeLabel(item: AppLocale): string {
  return item === 'zh-CN' ? t('locale.zhCN') : t('locale.enUS')
}

function selectLocale(item: AppLocale) {
  setLocale(item)
  open.value = false
}

async function toggleMenu() {
  open.value = !open.value
  if (!open.value) return
  await nextTick()
  positionMenu()
}

function positionMenu() {
  const rect = rootRef.value?.getBoundingClientRect()
  if (!rect) return
  const menuWidth = menuRef.value?.offsetWidth || 138
  const preferredLeft = rect.right - menuWidth
  const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8)
  menuStyle.value = {
    top: `${rect.bottom + 8}px`,
    left: `${Math.min(Math.max(8, preferredLeft), maxLeft)}px`
  }
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (!rootRef.value?.contains(target) && !menuRef.value?.contains(target)) open.value = false
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div ref="root" class="locale-switcher">
    <button
      type="button"
      class="header-icon-button"
      :aria-label="t('locale.label')"
      aria-haspopup="menu"
      :aria-expanded="open"
      data-test="locale-toggle"
      @click="toggleMenu"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.8 12h16.4M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5S14.1 18.2 12 20.5M12 3.5C9.9 5.8 8.8 8.6 8.8 12s1.1 6.2 3.2 8.5" />
      </svg>
      <svg class="locale-switcher__chevron" viewBox="0 0 10 6" aria-hidden="true">
        <path d="m1 1 4 4 4-4" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menu"
        class="locale-switcher__menu"
        role="menu"
        :aria-label="t('locale.label')"
        :data-theme="resolvedTheme"
        :style="menuStyle"
        @pointerdown.stop
      >
        <button
          v-for="item in supportedLocales"
          :key="item"
          type="button"
          class="locale-switcher__item"
          role="menuitemradio"
          :aria-checked="locale === item"
          :data-test="`locale-${item}`"
          @click="selectLocale(item)"
        >
          <svg v-if="locale === item" viewBox="0 0 12 12" aria-hidden="true">
            <path d="m2 6 2.4 2.4L10 3" />
          </svg>
          <span v-else class="locale-switcher__check-space" aria-hidden="true"></span>
          {{ localeLabel(item) }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.locale-switcher {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  margin-inline-start: 2px;
  padding-inline-start: 7px;
}

.locale-switcher::before {
  position: absolute;
  top: 50%;
  left: 0;
  width: 1px;
  height: 16px;
  background: rgba(var(--color-accent-rgb), 0.2);
  content: '';
  transform: translateY(-50%);
}

.header-icon-button {
  display: inline-grid;
  grid-template-columns: 17px 7px;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 32px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: var(--color-muted);
  background: transparent;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease;
}

.header-icon-button:hover,
.header-icon-button[aria-expanded='true'] {
  color: var(--color-accent-warm);
  background: rgba(var(--color-accent-rgb), 0.08);
}

.header-icon-button:focus-visible {
  outline: 2px solid var(--color-accent-warm);
  outline-offset: 1px;
}

.header-icon-button svg {
  width: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

.header-icon-button .locale-switcher__chevron {
  width: 7px;
  transition: transform 0.18s ease;
}

.header-icon-button[aria-expanded='true'] .locale-switcher__chevron {
  transform: rotate(180deg);
}

.locale-switcher__menu {
  --menu-panel: rgba(255, 253, 249, 0.96);
  --menu-text: #26323c;
  --menu-line: #e7ded2;
  --menu-accent: #b5613c;
  --menu-accent-rgb: 139, 115, 93;
  position: fixed;
  z-index: 100;
  min-width: 138px;
  padding: 6px;
  border: 1px solid var(--menu-line);
  border-radius: 10px;
  color: var(--menu-text);
  background: var(--menu-panel);
  box-shadow: 0 14px 34px rgba(84, 70, 52, 0.14);
  backdrop-filter: blur(14px);
}

.locale-switcher__menu[data-theme='atelier'] {
  --menu-panel: rgba(255, 252, 246, 0.97);
  --menu-text: #2b343b;
  --menu-line: #d8c6b2;
  --menu-accent: #b5613c;
  --menu-accent-rgb: 141, 107, 82;
}

.locale-switcher__menu[data-theme='nocturne'] {
  --menu-panel: rgba(27, 37, 43, 0.96);
  --menu-text: #e2e3de;
  --menu-line: rgba(177, 198, 203, 0.18);
  --menu-accent: #dfa168;
  --menu-accent-rgb: 118, 160, 168;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.38);
}

.locale-switcher__item {
  display: grid;
  grid-template-columns: 14px 1fr;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 8px 9px;
  border: 0;
  border-radius: 7px;
  color: var(--menu-text);
  background: transparent;
  text-align: start;
  cursor: pointer;
}

.locale-switcher__item:hover,
.locale-switcher__item:focus-visible {
  color: var(--menu-accent);
  background: rgba(var(--menu-accent-rgb), 0.09);
  outline: 0;
}

.locale-switcher__item svg {
  width: 12px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.locale-switcher__check-space {
  width: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .header-icon-button .locale-switcher__chevron {
    transition: none;
  }
}
</style>
