<script setup lang="ts">
import { computed } from 'vue'
import type { PublicProfileSocialLink } from '~/types/settings'

interface Props {
  links: PublicProfileSocialLink[]
  label?: string
  variant?: 'preview' | 'detail'
}

const props = withDefaults(defineProps<Props>(), {
  label: '社交链接',
  variant: 'detail'
})

function iconFor(platform: string) {
  const normalized = platform.trim().toLowerCase()
  if (normalized.includes('github')) return 'github'
  if (normalized.includes('mail') || normalized.includes('email')) return 'mail'
  if (normalized.includes('rss')) return 'rss'
  return 'external'
}

function isExternal(url: string) {
  return /^https?:\/\//i.test(url)
}

const normalizedLinks = computed(() => props.links.filter(link => link.platform.trim() && link.url.trim()))
</script>

<template>
  <nav
    v-if="normalizedLinks.length"
    class="profile-social-links"
    :class="`profile-social-links--${props.variant}`"
    :aria-label="props.label"
  >
    <a
      v-for="link in normalizedLinks"
      :key="`${link.platform}-${link.url}`"
      class="profile-social-links__link"
      :href="link.url"
      :aria-label="link.platform"
      :title="link.platform"
      :target="isExternal(link.url) ? '_blank' : undefined"
      :rel="isExternal(link.url) ? 'noopener noreferrer' : undefined"
    >
      <svg v-if="iconFor(link.platform) === 'github'" viewBox="0 0 24 24" aria-hidden="true">
        <path class="profile-social-links__fill" d="M12 2.4a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 2.9.8.1-.7.4-1.1.7-1.4-2.3-.3-4.6-1.1-4.6-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 4.9 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.8-2.3 4.6-4.6 4.9.4.3.7.9.7 1.8V21c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.4Z" />
      </svg>
      <svg v-else-if="iconFor(link.platform) === 'mail'" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </svg>
      <svg v-else-if="iconFor(link.platform) === 'rss'" viewBox="0 0 24 24" aria-hidden="true">
        <circle class="profile-social-links__fill" cx="5" cy="19" r="1.7" />
        <path d="M4 11a9 9 0 0 1 9 9M4 5a15 15 0 0 1 15 15" />
      </svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 4h6v6M20 4l-9 9" />
        <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
      </svg>
    </a>
  </nav>
</template>

<style scoped>
.profile-social-links {
  display: flex;
  margin: 0;
}

.profile-social-links--preview {
  justify-content: center;
  gap: 0;
  margin-top: 18px;
  padding-top: 15px;
  border-top: 1px solid var(--color-line);
}

.profile-social-links--detail {
  gap: 14px;
}

.profile-social-links__link {
  display: grid;
  color: var(--color-muted);
  place-items: center;
  text-decoration: none;
}

.profile-social-links--preview .profile-social-links__link {
  min-width: 72px;
  flex: 1 1 0;
}

.profile-social-links--detail .profile-social-links__link {
  width: 26px;
  height: 26px;
}

.profile-social-links__link:hover,
.profile-social-links__link:focus-visible {
  color: var(--color-accent);
  outline: none;
}

.profile-social-links__link:focus-visible {
  box-shadow: 0 0 0 2px rgba(var(--color-accent-rgb), 0.2);
}

.profile-social-links svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.profile-social-links__fill {
  fill: currentColor;
  stroke: none;
}
</style>
