import { computed, inject, provide, ref, type Ref } from 'vue'
import { defaultLocale, isAppLocale, messages, type AppLocale, type MessageKey } from '~/i18n/messages'

const i18nKey = Symbol('tblog-i18n')

export interface TblogI18n {
  locale: Ref<AppLocale>
  setLocale: (locale: AppLocale) => void
  t: (key: MessageKey, params?: Record<string, string | number>) => string
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
}

export function createTblogI18n(locale: Ref<AppLocale>): TblogI18n {
  function setLocale(next: AppLocale) {
    locale.value = next
  }

  function t(key: MessageKey, params: Record<string, string | number> = {}) {
    return Object.entries(params).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      messages[locale.value][key]
    )
  }

  return {
    locale,
    setLocale,
    t,
    formatDate: (value, options = { year: 'numeric', month: 'short', day: 'numeric' }) =>
      new Intl.DateTimeFormat(locale.value, options).format(new Date(value)),
    formatNumber: (value, options) => new Intl.NumberFormat(locale.value, options).format(value)
  }
}

export function provideTblogI18n(localeSource: Ref<string | null | undefined>) {
  const locale = computed<AppLocale>({
    get: () => isAppLocale(localeSource.value) ? localeSource.value : defaultLocale,
    set: value => { localeSource.value = value }
  })
  const i18n = createTblogI18n(locale)
  provide(i18nKey, i18n)
  return i18n
}

export function useTblogI18n(): TblogI18n {
  return inject<TblogI18n | undefined>(i18nKey, undefined) ?? createTblogI18n(ref(defaultLocale))
}
