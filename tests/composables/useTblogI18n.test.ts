import { ref } from 'vue'
import { createTblogI18n } from '../../composables/useTblogI18n'

describe('createTblogI18n', () => {
  it('uses Simplified Chinese by default and interpolates values', () => {
    const i18n = createTblogI18n(ref<'zh-CN' | 'en-US'>('zh-CN'))

    expect(i18n.t('nav.home')).toBe('首页')
    expect(i18n.t('common.minutesRead', { count: 3 })).toBe('3 分钟阅读')
  })

  it('switches to English and formats values with the active locale', () => {
    const locale = ref<'zh-CN' | 'en-US'>('zh-CN')
    const i18n = createTblogI18n(locale)

    i18n.setLocale('en-US')

    expect(i18n.t('nav.home')).toBe('Home')
    expect(i18n.formatNumber(1234)).toBe('1,234')
  })
})
