import { computed, inject, provide, shallowRef, type InjectionKey, type Ref } from 'vue'
import type { Envelope } from '~/composables/usePublicApi'
import type { PublicSiteConfigView } from '~/types/public-view'
import { absoluteUrl, resolveClientBaseUrl } from '~/utils/site-url'
import { publicResourceKey, useStaleFirstPublicResource } from '~/composables/useStaleFirstPublicResource'

/**
 * Public site configuration for SEO and analytics. Cacheable and keyed so the layout and every page
 * share one request. Failures degrade to defaults (the getters below fall back), so SEO never throws.
 */
export function usePublicSiteConfig() {
  return useStaleFirstPublicResource<Envelope<PublicSiteConfigView>>('/api/v1/site-config', {
    key: publicResourceKey('site-config')
  })
}

const publicSiteConfigDataKey: InjectionKey<Ref<Envelope<PublicSiteConfigView> | null | undefined>> =
  Symbol('tblog-public-site-config-data')

export function providePublicSiteConfigData(data: Ref<Envelope<PublicSiteConfigView> | null | undefined>) {
  provide(publicSiteConfigDataKey, data)
}

/** Public components can consume the layout-provided config without becoming Nuxt-runtime-only. */
export function useOptionalPublicSiteConfigData() {
  return inject(publicSiteConfigDataKey, shallowRef<Envelope<PublicSiteConfigView> | null | undefined>())
}

/**
 * Derived SEO context: site identity, defaults, and the resolved public base URL. The base URL
 * mirrors the server precedence (`seo.canonicalBaseUrl` then `NUXT_PUBLIC_SITE_URL`).
 */
export function useSeoContext() {
  const runtimeConfig = useRuntimeConfig()
  const data = useOptionalPublicSiteConfigData()
  const config = computed(() => data.value?.data)

  const siteName = computed(() => config.value?.site.siteName ?? 'TBLOG')
  const defaultTitle = computed(() => config.value?.seo.defaultTitle?.trim() || null)
  const defaultDescription = computed(
    () => config.value?.seo.defaultDescription?.trim() || config.value?.site.description?.trim() || null
  )
  const locale = computed(() => config.value?.site.locale ?? 'zh-CN')
  const robotsPolicy = computed(() => config.value?.seo.robotsPolicy ?? 'index,follow')
  const logoUrl = computed(() => config.value?.site.logoUrl ?? null)
  const baseUrl = computed(() =>
    resolveClientBaseUrl(config.value?.seo.canonicalBaseUrl ?? null, runtimeConfig.public.siteUrl)
  )

  function canonicalFor(path: string): string {
    return absoluteUrl(baseUrl.value, path)
  }

  /** Make a possibly-relative image/href absolute against the resolved base URL. */
  function toAbsolute(url: string | null): string | null {
    if (!url) {
      return null
    }
    if (/^https?:\/\//i.test(url)) {
      return url
    }
    return absoluteUrl(baseUrl.value, url)
  }

  return {
    config,
    siteName,
    defaultTitle,
    defaultDescription,
    locale,
    robotsPolicy,
    logoUrl,
    baseUrl,
    canonicalFor,
    toAbsolute
  }
}
