import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import {
  createTblogTheme,
  migrateLegacyThemePreference
} from '../../composables/useTblogTheme'

function mountTheme(sourceValue: string, systemDark: boolean) {
  const source = ref<string | null>(sourceValue)
  let changeListener: ((event: MediaQueryListEvent) => void) | undefined

  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query.includes('prefers-color-scheme') && systemDark,
    media: query,
    onchange: null,
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      if (event === 'change') changeListener = listener as (event: MediaQueryListEvent) => void
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false)
  }) as never)

  let theme!: ReturnType<typeof createTblogTheme>
  const Host = defineComponent({
    setup() {
      theme = createTblogTheme(source)
      return () => h('div')
    }
  })
  const wrapper = mount(Host)

  return {
    source,
    theme,
    wrapper,
    changeSystem(matches: boolean) {
      changeListener?.({ matches } as MediaQueryListEvent)
    }
  }
}

describe('useTblogTheme', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps configured light themes separate from visitor color mode', async () => {
    const { source, theme, wrapper, changeSystem } = mountTheme('system', false)
    await nextTick()

    expect(theme.resolvedTheme.value).toBe('default')

    theme.setLightTheme('atelier')
    expect(theme.resolvedTheme.value).toBe('atelier')

    changeSystem(true)
    expect(theme.resolvedTheme.value).toBe('nocturne')

    theme.setColorMode('light')
    expect(source.value).toBe('light')
    expect(theme.resolvedTheme.value).toBe('atelier')

    theme.setColorMode('dark')
    expect(theme.resolvedTheme.value).toBe('nocturne')

    theme.setColorMode('system')
    expect(source.value).toBe('system')
    expect(theme.resolvedTheme.value).toBe('nocturne')
    wrapper.unmount()
  })

  it('falls back to system mode and migrates legacy cookie values by color mode', async () => {
    const { theme, wrapper } = mountTheme('invalid', true)
    await nextTick()

    expect(theme.preference.value).toBe('system')
    expect(theme.resolvedTheme.value).toBe('nocturne')
    expect(migrateLegacyThemePreference('atelier')).toBe('light')
    expect(migrateLegacyThemePreference('nocturne')).toBe('dark')
    expect(migrateLegacyThemePreference('system')).toBe('system')
    expect(migrateLegacyThemePreference('unknown')).toBeNull()
    wrapper.unmount()
  })
})
