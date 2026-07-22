<script setup lang="ts">
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  siteName?: string
  socialLinks?: { platform: string; url: string }[]
}

const props = withDefaults(defineProps<Props>(), { siteName: 'TBLOG', socialLinks: () => [] })
const { t } = useTblogI18n()
</script>

<template>
  <footer class="site-footer">
    <div class="container site-footer__inner">
      <span class="site-footer__brand">© {{ props.siteName }}</span>
      <div class="site-footer__aside">
        <nav v-if="props.socialLinks.length" class="site-footer__social" :aria-label="t('footer.social')">
          <a
            v-for="link in props.socialLinks"
            :key="`${link.platform}:${link.url}`"
            class="site-footer__social-link"
            :href="link.url"
            target="_blank"
            rel="noopener noreferrer"
          >{{ link.platform }}</a>
        </nav>
        <span class="site-footer__note">{{ t('footer.builtWith') }}</span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  margin-top: 48px;
  border-top: 1px solid var(--color-line);
}

.site-footer__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 72px;
  color: var(--color-muted);
  font-size: 0.9rem;
}

.site-footer__brand {
  font-weight: 700;
}

.site-footer__aside,
.site-footer__social {
  display: flex;
  align-items: center;
  gap: 12px;
}

.site-footer__social-link {
  color: var(--color-accent);
  text-decoration: none;
}

.site-footer__social-link:hover {
  text-decoration: underline;
}

@media (max-width: 520px) {
  .site-footer__inner {
    flex-direction: column;
    gap: 6px;
    min-height: auto;
    padding-block: 20px;
    text-align: center;
  }

  .site-footer__aside {
    flex-direction: column;
    gap: 6px;
  }
}
</style>
