import { computed, inject, onBeforeUnmount, onMounted, provide, ref, type Ref } from 'vue'
import type { SiteLightTheme } from '~/types/settings'

export const colorModePreferences = ['system', 'light', 'dark'] as const
export type ColorModePreference = typeof colorModePreferences[number]
export type ResolvedColorMode = Exclude<ColorModePreference, 'system'>
export type ResolvedTheme = SiteLightTheme | 'nocturne'

const themeKey = Symbol('tblog-theme')

function isColorModePreference(value: unknown): value is ColorModePreference {
  return typeof value === 'string' && colorModePreferences.includes(value as ColorModePreference)
}

function isSiteLightTheme(value: unknown): value is SiteLightTheme {
  return value === 'default' || value === 'atelier'
}

export function migrateLegacyThemePreference(value: unknown): ColorModePreference | null {
  if (value === 'system') return 'system'
  if (value === 'atelier') return 'light'
  if (value === 'nocturne') return 'dark'
  return null
}

export function createTblogTheme(source: Ref<string | null | undefined>) {
  const systemDark = ref(false)
  const lightTheme = ref<SiteLightTheme>('default')
  let media: MediaQueryList | null = null

  const preference = computed<ColorModePreference>({
    get: () => isColorModePreference(source.value) ? source.value : 'system',
    set: value => { source.value = value }
  })
  const resolvedColorMode = computed<ResolvedColorMode>(() => {
    if (preference.value !== 'system') return preference.value
    return systemDark.value ? 'dark' : 'light'
  })
  const resolvedTheme = computed<ResolvedTheme>(() =>
    resolvedColorMode.value === 'dark' ? 'nocturne' : lightTheme.value
  )

  function updateSystemTheme(event?: MediaQueryListEvent) {
    systemDark.value = event?.matches ?? media?.matches ?? false
  }

  onMounted(() => {
    if (typeof window.matchMedia !== 'function') return
    media = window.matchMedia('(prefers-color-scheme: dark)')
    updateSystemTheme()
    media.addEventListener('change', updateSystemTheme)
  })

  onBeforeUnmount(() => {
    media?.removeEventListener('change', updateSystemTheme)
  })

  return {
    preference,
    lightTheme,
    resolvedColorMode,
    resolvedTheme,
    setColorMode(value: ColorModePreference) {
      preference.value = isColorModePreference(value) ? value : 'system'
    },
    setLightTheme(value: SiteLightTheme) {
      lightTheme.value = isSiteLightTheme(value) ? value : 'default'
    }
  }
}

export function provideTblogTheme(source: Ref<string | null | undefined>) {
  const theme = createTblogTheme(source)
  provide(themeKey, theme)
  return theme
}

export function useTblogTheme() {
  return inject<ReturnType<typeof createTblogTheme> | undefined>(themeKey, undefined)
    ?? createTblogTheme(ref('system'))
}
