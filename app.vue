<script setup lang="ts">
import AmbientBackground from '~/components/site/AmbientBackground.vue'
import { providePublicImages } from '~/composables/usePublicImages'
import { providePublicSiteConfigData, usePublicSiteConfig } from '~/composables/useSiteConfig'
import { provideTblogI18n } from '~/composables/useTblogI18n'
import { migrateLegacyThemePreference, provideTblogTheme } from '~/composables/useTblogTheme'

const localeCookie = useCookie<string>('tblog_locale', {
  default: () => 'zh-CN',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365
})
const { locale } = provideTblogI18n(localeCookie)
const legacyThemeCookie = useCookie<string | null>('tblog_theme')
const colorModeCookie = useCookie<string>('tblog_color_mode', {
  default: () => migrateLegacyThemePreference(legacyThemeCookie.value) ?? 'system',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365
})
const { lightTheme, preference, resolvedTheme, setLightTheme } = provideTblogTheme(colorModeCookie)
const { data: publicSiteConfig } = usePublicSiteConfig()
providePublicSiteConfigData(publicSiteConfig)
providePublicImages(publicSiteConfig)
watchEffect(() => setLightTheme(publicSiteConfig.value?.data.site.lightTheme ?? 'default'))
onMounted(() => {
  for (const name of ['tblog_analytics_consent', 'tblog_analytics_visitor', 'tblog_analytics_session', 'tblog_analytics_session_active']) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
  }
})

const faviconHref = computed(() => publicSiteConfig.value?.data.site.faviconUrl?.trim() || null)
// Document language follows site content locale for SEO; UI cookie only drives i18n strings.
const documentLang = computed(
  () => publicSiteConfig.value?.data.site.locale?.trim() || locale.value
)

useHead(() => ({
  htmlAttrs: {
    lang: documentLang.value,
    'data-color-mode': preference.value,
    'data-theme': resolvedTheme.value,
    'data-light-theme': lightTheme.value
  },
  // Only emit when configured so browsers can still fall back to /favicon.ico by default.
  link: faviconHref.value
    ? [
        { rel: 'icon', href: faviconHref.value, key: 'site-favicon' },
        { rel: 'shortcut icon', href: faviconHref.value, key: 'site-shortcut-icon' }
      ]
    : []
}))
</script>

<template>
  <NuxtRouteAnnouncer />
  <AmbientBackground
    :theme="resolvedTheme"
    :color-mode="preference"
    :light-theme="lightTheme"
  />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
