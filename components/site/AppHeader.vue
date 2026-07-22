<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import HeaderParticles from '~/components/site/HeaderParticles.vue'
import LocaleSwitcher from '~/components/site/LocaleSwitcher.vue'
import SiteSearchDialog from '~/components/site/SiteSearchDialog.vue'
import ThemeSwitcher from '~/components/site/ThemeSwitcher.vue'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { useTblogTheme } from '~/composables/useTblogTheme'
import type { SearchConfigPayload } from '~/composables/usePublicSearch'

interface Props {
  siteName?: string
  logoUrl?: string
  logoLetter?: string
  navigation?: { label: string; href: string }[]
  sticky?: boolean
  searchEnabled?: boolean
  searchConfig?: SearchConfigPayload | null
}

const props = withDefaults(defineProps<Props>(), {
  siteName: 'TBLOG',
  logoUrl: '',
  logoLetter: '',
  navigation: () => [],
  sticky: true,
  searchEnabled: false,
  searchConfig: null
})
const { t } = useTblogI18n()
const { preference, resolvedTheme } = useTblogTheme()

const navLinks = computed(() => {
  const defaults = [
    { label: t('nav.home'), href: '/' },
    { label: t('nav.categories'), href: '/categories' },
    { label: t('nav.archive'), href: '/archive' },
    { label: t('nav.about'), href: '/about' }
  ]
  const sourceLinks = props.navigation.length > 0 ? props.navigation : defaults
  const links = sourceLinks.filter((item) =>
    item.label.trim()
    && item.href.trim()
    && item.href !== '/tags'
    && (props.searchEnabled || item.href !== '/search')
  )
  return links
})

function isInternalRoute(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//')
}

const scrolled = ref(false)
const logoImageFailed = ref(false)
let scrollListening = false

const markLetter = computed(() => {
  return props.logoLetter.trim().slice(0, 1) || props.siteName.trim().slice(0, 1) || 'T'
})

const showLogoImage = computed(() => props.logoUrl.trim().length > 0 && !logoImageFailed.value)

function updateScrolledState() {
  scrolled.value = window.scrollY > 12
}

function attachScrollListener() {
  if (scrollListening) return
  updateScrolledState()
  window.addEventListener('scroll', updateScrolledState, { passive: true })
  scrollListening = true
}

function detachScrollListener() {
  if (!scrollListening) return
  window.removeEventListener('scroll', updateScrolledState)
  scrollListening = false
}

function syncStickyBehavior(sticky: boolean) {
  if (sticky) {
    attachScrollListener()
    return
  }

  detachScrollListener()
  scrolled.value = false
}

watch(() => props.logoUrl, () => {
  logoImageFailed.value = false
})

watch(() => props.sticky, (sticky) => {
  syncStickyBehavior(sticky)
})

onMounted(() => {
  syncStickyBehavior(props.sticky)
})

onBeforeUnmount(() => {
  detachScrollListener()
})
</script>

<template>
  <header
    class="site-header"
    :class="{
      'site-header--scrolled': props.sticky && scrolled,
      'site-header--static': !props.sticky,
      'site-header--system': preference === 'system',
      'site-header--nocturne': resolvedTheme === 'nocturne'
    }"
  >
    <HeaderParticles :muted="props.sticky && scrolled" :theme="resolvedTheme" />
    <div class="site-header__inner">
      <NuxtLink class="site-header__brand" to="/">
        <span class="site-header__mark" aria-hidden="true">
          <img
            v-if="showLogoImage"
            class="site-header__mark-image"
            :src="props.logoUrl"
            alt=""
            decoding="async"
            @error="logoImageFailed = true"
          />
          <span v-else class="site-header__mark-letter">{{ markLetter }}</span>
        </span>
        <span class="site-header__wordmark">{{ props.siteName }}</span>
      </NuxtLink>
      <div class="site-header__nav-wrap">
        <SiteSearchDialog :enabled="props.searchEnabled" :config="props.searchConfig" />
        <nav class="site-header__nav" :aria-label="t('nav.primary')">
          <template v-for="link in navLinks" :key="`${link.label}:${link.href}`">
            <NuxtLink
              v-if="isInternalRoute(link.href)"
              class="site-header__link"
              :to="link.href"
            >
              {{ link.label }}
            </NuxtLink>
            <a
              v-else
              class="site-header__link"
              :href="link.href"
              :target="/^https?:\/\//i.test(link.href) || link.href.startsWith('//') ? '_blank' : undefined"
              :rel="/^https?:\/\//i.test(link.href) || link.href.startsWith('//') ? 'noopener noreferrer' : undefined"
            >
              {{ link.label }}
            </a>
          </template>
        </nav>
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  overflow: clip;
  border-bottom: 1px solid transparent;
  background: rgba(var(--color-page-rgb), 0.4);
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.site-header--scrolled {
  border-bottom-color: rgba(var(--color-accent-rgb), 0.2);
  background: rgba(var(--color-page-rgb), 0.82);
  box-shadow: 0 8px 24px rgba(var(--color-text-rgb), 0.085);
}

.site-header--static {
  position: relative;
  top: auto;
}

.site-header__inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  width: min(100% - 48px, 1180px);
  min-height: 66px;
  margin-inline: auto;
  transition: min-height 0.2s ease;
}

.site-header--scrolled .site-header__inner {
  min-height: 59px;
}

.site-header__brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 820;
  letter-spacing: 0.07em;
  text-decoration: none;
}

.site-header__mark {
  position: relative;
  display: grid;
  width: 27px;
  height: 27px;
  overflow: hidden;
  border: 1px solid rgba(var(--color-accent-rgb), 0.34);
  border-radius: 9px;
  color: var(--color-accent);
  background: linear-gradient(145deg, rgba(var(--color-panel-rgb), 0.88), rgba(var(--color-accent-rgb), 0.14));
  box-shadow:
    inset 0 0 0 3px rgba(var(--color-panel-rgb), 0.28),
    0 5px 12px rgba(var(--color-text-rgb), 0.09);
  place-items: center;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.site-header__mark::before {
  position: absolute;
  top: -7px;
  left: -14px;
  width: 10px;
  height: 42px;
  background: rgba(var(--color-panel-rgb), 0.72);
  content: '';
  transform: rotate(28deg);
  transition: left 0.35s ease;
}

.site-header__brand:hover .site-header__mark {
  box-shadow:
    inset 0 0 0 3px rgba(var(--color-panel-rgb), 0.3),
    0 7px 16px rgba(var(--color-text-rgb), 0.15);
  transform: translateY(-1px) rotate(-2deg);
}

.site-header__brand:hover .site-header__mark::before {
  left: 36px;
}

.site-header__mark-letter {
  position: relative;
  z-index: 1;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
}

.site-header__mark-image {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.site-header__wordmark {
  line-height: 1;
}

.site-header__nav-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  position: relative;
  min-width: 0;
}

.site-header__nav {
  display: flex;
  align-items: center;
  gap: 7px;
}

.site-header__link {
  position: relative;
  padding: 10px 8px;
  color: var(--color-muted);
  font-size: 0.8rem;
  font-weight: 650;
  text-decoration: none;
  transition: color 0.18s ease;
}

.site-header__link:hover,
.site-header__link.router-link-active {
  color: var(--color-accent-warm);
}

.site-header__link.router-link-active::after {
  position: absolute;
  right: 27%;
  bottom: 4px;
  left: 27%;
  height: 2px;
  border-radius: 999px;
  background: var(--color-accent-warm);
  content: '';
}

.site-header__brand:focus-visible,
.site-header__link:focus-visible {
  outline: 2px solid var(--color-accent-warm);
  outline-offset: 2px;
}

@media (max-width: 720px) {
  .site-header__inner {
    width: min(100% - 28px, 1180px);
    min-height: 58px;
    gap: 15px;
  }

  .site-header__brand {
    flex: 0 0 auto;
    font-size: 0.86rem;
  }

  .site-header__mark {
    width: 24px;
    height: 24px;
    border-radius: 8px;
  }

  .site-header__mark-letter {
    font-size: 0.88rem;
  }

  .site-header__nav-wrap {
    max-width: 69vw;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .site-header__nav-wrap::-webkit-scrollbar {
    display: none;
  }

  .site-header__nav-wrap::after {
    position: absolute;
    top: 0;
    right: -1px;
    bottom: 0;
    width: 20px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(var(--color-page-rgb), 0.92));
    content: '';
  }

  .site-header__nav {
    flex: 0 0 auto;
    min-width: 0;
    gap: 5px;
    padding-inline-end: 0;
  }

  .site-header__link {
    min-height: 34px;
    padding: 7px 8px;
    font-size: 0.73rem;
    white-space: nowrap;
  }

  .site-header__nav-wrap :deep(.locale-switcher) {
    margin-inline-end: 0;
  }

  .site-header__nav-wrap :deep(.theme-switcher) {
    margin-inline-end: 19px;
  }
}

.site-header--nocturne .site-header__mark {
  color: var(--color-accent-warm);
  box-shadow:
    inset 0 0 12px rgba(var(--color-accent-warm-rgb), 0.04),
    0 0 18px rgba(var(--color-accent-warm-rgb), 0.16);
}

@media (prefers-color-scheme: dark) {
  .site-header--system .site-header__mark {
    color: var(--color-accent-warm);
    box-shadow:
      inset 0 0 12px rgba(var(--color-accent-warm-rgb), 0.04),
      0 0 18px rgba(var(--color-accent-warm-rgb), 0.16);
  }
}

</style>
