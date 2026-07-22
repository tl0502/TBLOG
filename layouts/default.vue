<script setup lang="ts">
import AppHeader from '~/components/site/AppHeader.vue'
import AppFooter from '~/components/site/AppFooter.vue'
import BackToTopButton from '~/components/site/BackToTopButton.vue'
import { provideSearchConfigState, useSearchConfig } from '~/composables/usePublicSearch'
import { useAnalyticsInjection, useSiteSeoDefaults } from '~/composables/useSeo'
import { useOptionalPublicSiteConfigData } from '~/composables/useSiteConfig'
import { useTblogTheme } from '~/composables/useTblogTheme'

// Search is optional decoration in the public header. One client-owned state feeds both the header
// and the search page, so they never create competing same-key useAsyncData handlers.
const searchConfigState = useSearchConfig({ server: false })
provideSearchConfigState(searchConfigState)
const { data: searchConfigData } = searchConfigState
const searchEnabled = computed(() => searchConfigData.value?.data?.enabled === true)
const searchConfig = computed(() => searchConfigData.value?.data?.config ?? null)
const siteConfigData = useOptionalPublicSiteConfigData()
const site = computed(() => siteConfigData.value?.data.site)
const { lightTheme, preference, resolvedTheme } = useTblogTheme()

// Site-wide public SEO defaults (title template, canonical, robots, Open Graph) plus optional
// frontend-direct analytics. Individual pages override the page-specific tags.
useSiteSeoDefaults()
useAnalyticsInjection()
</script>

<template>
  <div
    class="site-shell"
    :data-theme="resolvedTheme"
    :data-color-mode="preference"
    :data-light-theme="lightTheme"
  >
    <AppHeader
      :site-name="site?.siteName"
      :logo-url="site?.logoUrl ?? undefined"
      :navigation="site?.navigation"
      :sticky="true"
      :search-enabled="searchEnabled"
      :search-config="searchConfig"
    />
    <main class="site-main">
      <slot />
    </main>
    <AppFooter :site-name="site?.siteName" :social-links="site?.socialLinks" />
    <BackToTopButton />
  </div>
</template>

<style scoped>
.site-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  color: var(--color-text);
  background:
    linear-gradient(135deg, rgba(var(--color-accent-rgb), 0.045), transparent 42%),
    rgba(var(--color-page-rgb), 0.58);
  transition: color 0.24s ease, background 0.24s ease;
}

.site-shell[data-theme='nocturne'] {
  background:
    radial-gradient(circle at 8% 18%, rgba(223, 161, 104, 0.58) 0 1px, transparent 2px),
    radial-gradient(circle at 21% 72%, rgba(142, 177, 184, 0.42) 0 1px, transparent 2px),
    radial-gradient(circle at 37% 34%, rgba(223, 161, 104, 0.3) 0 1px, transparent 2px),
    radial-gradient(circle at 56% 81%, rgba(142, 177, 184, 0.34) 0 1px, transparent 2px),
    radial-gradient(circle at 73% 22%, rgba(223, 161, 104, 0.38) 0 1px, transparent 2px),
    radial-gradient(circle at 91% 61%, rgba(142, 177, 184, 0.4) 0 1px, transparent 2px),
    radial-gradient(34rem 20rem at 52% -6%, rgba(78, 111, 119, 0.1), transparent 70%),
    var(--color-page);
}

@media (prefers-color-scheme: dark) {
  .site-shell[data-color-mode='system'] {
    background:
      radial-gradient(circle at 8% 18%, rgba(223, 161, 104, 0.58) 0 1px, transparent 2px),
      radial-gradient(circle at 21% 72%, rgba(142, 177, 184, 0.42) 0 1px, transparent 2px),
      radial-gradient(circle at 37% 34%, rgba(223, 161, 104, 0.3) 0 1px, transparent 2px),
      radial-gradient(circle at 56% 81%, rgba(142, 177, 184, 0.34) 0 1px, transparent 2px),
      radial-gradient(circle at 73% 22%, rgba(223, 161, 104, 0.38) 0 1px, transparent 2px),
      radial-gradient(circle at 91% 61%, rgba(142, 177, 184, 0.4) 0 1px, transparent 2px),
      radial-gradient(34rem 20rem at 52% -6%, rgba(78, 111, 119, 0.1), transparent 70%),
      var(--color-page);
  }
}

.site-main {
  width: 100%;
  flex: 1;
}
</style>
