import { computed, type Ref } from 'vue'
import type { PostDetailView } from '~/types/public-view'
import { useSeoContext } from '~/composables/useSiteConfig'
import { buildAnalyticsHead } from '~/utils/analytics-head'

/**
 * Public SEO head management. `useSiteSeoDefaults` runs once in the public layout to set the shared
 * title template, language, robots directive, canonical, and Open Graph/Twitter defaults from site
 * settings. Pages then override the specifics (title, description, per-post image, JSON-LD). All
 * values derive from stored content and the public settings projection — never from live Markdown.
 */
function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value
    }
  }
  return null
}

/** Keep JSON-LD valid while preventing stored text from terminating the surrounding script tag. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function useSiteSeoDefaults() {
  const route = useRoute()
  const { siteName, defaultTitle, defaultDescription, robotsPolicy, canonicalFor, locale } =
    useSeoContext()

  const canonical = computed(() => canonicalFor(route.path))

  useHead(() => ({
    titleTemplate: (title?: string) =>
      title ? `${title} · ${siteName.value}` : defaultTitle.value || siteName.value,
    htmlAttrs: { lang: locale.value },
    link: [{ rel: 'canonical', href: canonical.value, key: 'canonical' }],
    meta: [{ name: 'robots', content: robotsPolicy.value, key: 'robots' }]
  }))

  useSeoMeta({
    description: () => defaultDescription.value ?? '',
    ogSiteName: () => siteName.value,
    ogType: 'website',
    ogTitle: () => defaultTitle.value || siteName.value,
    ogDescription: () => defaultDescription.value ?? '',
    ogUrl: () => canonical.value,
    ogLocale: () => locale.value,
    twitterCard: 'summary',
    twitterTitle: () => defaultTitle.value || siteName.value,
    twitterDescription: () => defaultDescription.value ?? ''
  })
}

/** Title/description overrides for simple pages (taxonomy, archive, about). Canonical is inherited. */
export function useBasicPageSeo(options: {
  title: () => string | null | undefined
  description?: () => string | null | undefined
}) {
  useSeoMeta({
    title: () => options.title() ?? undefined,
    ogTitle: () => options.title() ?? undefined,
    twitterTitle: () => options.title() ?? undefined,
    description: () => options.description?.() ?? undefined,
    ogDescription: () => options.description?.() ?? undefined,
    twitterDescription: () => options.description?.() ?? undefined
  })
}

/** Site-identity WebSite JSON-LD for the homepage. */
export function useHomeSeo() {
  const { siteName, defaultDescription, baseUrl } = useSeoContext()

  useHead(() => ({
    script: [
      {
        type: 'application/ld+json',
        key: 'ld-website',
        textContent: serializeJsonLd({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: siteName.value,
          url: `${baseUrl.value}/`,
          ...(defaultDescription.value ? { description: defaultDescription.value } : {})
        })
      }
    ]
  }))
}

/** Per-article metadata: title/description fallbacks, canonical override, OG image, Article JSON-LD. */
export function useArticleSeo(post: Ref<PostDetailView | null>) {
  const route = useRoute()
  const { siteName, defaultDescription, logoUrl, canonicalFor, toAbsolute } = useSeoContext()

  const title = computed(() => firstNonEmpty(post.value?.seoTitle, post.value?.title) ?? undefined)
  const description = computed(
    () =>
      firstNonEmpty(post.value?.seoDescription, post.value?.excerpt, defaultDescription.value) ??
      undefined
  )
  const canonical = computed(
    () => firstNonEmpty(post.value?.canonicalUrlOverride) ?? canonicalFor(route.path)
  )
  const ogImage = computed(() =>
    toAbsolute(firstNonEmpty(post.value?.openGraphImageUrl, post.value?.cover))
  )
  const twitterImage = computed(() =>
    toAbsolute(firstNonEmpty(post.value?.twitterImageUrl, post.value?.openGraphImageUrl, post.value?.cover))
  )
  const publisherLogo = computed(() => toAbsolute(logoUrl.value))

  useSeoMeta({
    title: () => title.value,
    ogTitle: () => title.value,
    twitterTitle: () => title.value,
    description: () => description.value,
    ogDescription: () => description.value,
    twitterDescription: () => description.value,
    ogType: 'article',
    ogUrl: () => canonical.value,
    ogImage: () => ogImage.value ?? undefined,
    twitterImage: () => twitterImage.value ?? undefined,
    twitterCard: () => (twitterImage.value ? 'summary_large_image' : 'summary'),
    articlePublishedTime: () => post.value?.publishedAt
  })

  useHead(() => ({
    link: [{ rel: 'canonical', href: canonical.value, key: 'canonical' }],
    script: [
      {
        type: 'application/ld+json',
        key: 'ld-article',
        textContent: buildArticleJsonLd({
          post: post.value,
          canonical: canonical.value,
          image: ogImage.value,
          siteName: siteName.value,
          logoUrl: publisherLogo.value
        })
      }
    ]
  }))
}

/** Prefer an admin-authored JSON-LD override when it is valid JSON; otherwise generate an Article. */
function buildArticleJsonLd(input: {
  post: PostDetailView | null
  canonical: string
  image: string | null
  siteName: string
  logoUrl: string | null
}): string {
  const { post } = input
  if (!post) {
    return '{}'
  }

  if (post.jsonLdOverrideJson) {
    try {
      return serializeJsonLd(JSON.parse(post.jsonLdOverrideJson))
    } catch {
      // Fall through to the generated document when the override is not valid JSON.
    }
  }

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: firstNonEmpty(post.seoTitle, post.title) ?? post.title,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    url: input.canonical,
    mainEntityOfPage: input.canonical,
    author: { '@type': 'Person', name: input.siteName },
    publisher: {
      '@type': 'Organization',
      name: input.siteName,
      ...(input.logoUrl ? { logo: { '@type': 'ImageObject', url: input.logoUrl } } : {})
    }
  }

  const description = firstNonEmpty(post.seoDescription, post.excerpt)
  if (description) {
    jsonLd.description = description
  }
  if (input.image) {
    jsonLd.image = [input.image]
  }

  return serializeJsonLd(jsonLd)
}

/** Inject the configured frontend-direct analytics script (no-op when disabled). */
export function useAnalyticsInjection() {
  const { config } = useSeoContext()
  useHead(() => buildAnalyticsHead(config.value?.analytics))
}
