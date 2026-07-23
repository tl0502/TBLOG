<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ArticleListItemView } from '~/types/public-view'
import { useTblogI18n } from '~/composables/useTblogI18n'

const props = withDefaults(defineProps<{ articles: ArticleListItemView[]; fallbackCover?: string | null }>(), { fallbackCover: null })
const { formatDate, t } = useTblogI18n()
const active = ref(0)
const current = computed(() => props.articles[active.value] ?? null)
const cover = computed(() => current.value?.cover || props.fallbackCover || null)
const backgroundStyle = computed(() => cover.value ? { backgroundImage: `url(${JSON.stringify(cover.value)})` } : undefined)
watch(() => props.articles.length, length => { if (!length || active.value >= length) active.value = 0 })
function move(delta: number) { if (props.articles.length) active.value = (active.value + delta + props.articles.length) % props.articles.length }
</script>

<template>
  <section class="home-intro-card" :class="{ 'home-intro-card--with-cover': cover }" :style="backgroundStyle" aria-labelledby="home-intro-title">
    <div class="home-intro-card__shade" aria-hidden="true" />
    <button v-if="articles.length > 1" class="home-intro-card__arrow home-intro-card__arrow--prev" type="button" :aria-label="t('home.previousFeatured')" @click="move(-1)"><span aria-hidden="true">‹</span></button>
    <button v-if="articles.length > 1" class="home-intro-card__arrow home-intro-card__arrow--next" type="button" :aria-label="t('home.nextFeatured')" @click="move(1)"><span aria-hidden="true">›</span></button>
    <div class="home-intro-card__count">{{ t('home.pinned') }} · {{ String(current ? active + 1 : 0).padStart(2, '0') }} / {{ String(articles.length).padStart(2, '0') }}</div>
    <div class="home-intro-card__content">
      <h1 id="home-intro-title" class="home-intro-card__title"><NuxtLink v-if="current" :to="`/posts/${current.slug}`">{{ current.title }}</NuxtLink><span v-else>{{ t('home.guideTitle') }}</span></h1>
      <p class="home-intro-card__summary">{{ current?.excerpt ?? t('home.guideSummary') }}</p>
      <div v-if="current" class="home-intro-card__meta"><span>{{ formatDate(current.publishedAt) }}</span><span>{{ t('common.minutesRead', { count: current.readingTime }) }}</span><span v-if="current.category">{{ current.category.name }}</span></div>
    </div>
    <div v-if="articles.length > 1" class="home-intro-card__dots" :style="{ '--slide-count': articles.length }"><button v-for="(_, index) in articles" :key="index" type="button" :class="{ 'is-active': index === active }" :aria-label="`${t('home.pinned')} ${index + 1}`" @click="active = index" /></div>
  </section>
</template>

<style scoped>
.home-intro-card{position:relative;display:flex;min-height:370px;overflow:hidden;padding:52px 72px 58px;border:1px solid var(--color-line);border-radius:var(--radius-card);color:var(--color-text);background:linear-gradient(145deg,rgba(var(--color-accent-rgb),.12),rgba(var(--color-panel-rgb),.96)) center/cover;box-shadow:var(--shadow-card);align-items:center;justify-content:center;text-align:center;transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease}@media (hover:hover) and (pointer:fine){.home-intro-card:hover{border-color:rgba(var(--color-accent-rgb),.4);box-shadow:var(--shadow-card-hover);transform:translateY(-3px)}}.home-intro-card__shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(17,24,29,.22),rgba(17,24,29,.78));opacity:0;pointer-events:none}.home-intro-card--with-cover{color:#fff}.home-intro-card--with-cover .home-intro-card__shade{opacity:1}.home-intro-card__content{position:relative;z-index:1;width:min(100%,850px)}.home-intro-card__count{position:absolute;top:20px;left:24px;z-index:1;color:inherit;font-size:.68rem;font-weight:750;letter-spacing:.08em;opacity:.7;text-transform:uppercase}.home-intro-card__title{margin:0 auto 16px;font-family:var(--font-display);font-size:clamp(2rem,4vw,3.6rem);font-weight:650;letter-spacing:-.04em;line-height:1.04;text-wrap:balance}.home-intro-card__title a{color:inherit;text-decoration:none}.home-intro-card__summary{max-width:48rem;margin:0 auto;color:inherit;line-height:1.7;opacity:.78}.home-intro-card__meta{display:flex;justify-content:center;gap:14px;margin-top:18px;color:inherit;font-size:.8rem;opacity:.68}.home-intro-card__arrow{position:absolute;top:50%;z-index:2;display:grid;width:30px;height:30px;padding:0;border:1px solid currentColor;border-radius:50%;color:inherit;background:transparent;cursor:pointer;opacity:0;place-items:center;transform:translateY(-50%);transition:opacity .18s ease,background .18s ease}.home-intro-card__arrow span{display:block;font:400 1.05rem/1 Arial,sans-serif;transform:translateY(-1px)}.home-intro-card:hover .home-intro-card__arrow,.home-intro-card:focus-within .home-intro-card__arrow{opacity:.55}.home-intro-card__arrow:hover{background:rgba(255,255,255,.12);opacity:1}.home-intro-card__arrow--prev{left:18px}.home-intro-card__arrow--next{right:18px}.home-intro-card__dots{position:absolute;bottom:28px;left:50%;z-index:1;display:flex;width:clamp(104px,calc(var(--slide-count,4) * 32px),220px);gap:6px;transform:translateX(-50%)}.home-intro-card__dots button{flex:1;height:4px;padding:0;border:0;border-radius:99px;background:currentColor;cursor:pointer;opacity:.32}.home-intro-card__dots button.is-active{opacity:1}@media(max-width:640px){.home-intro-card{min-height:390px;padding:50px 48px 58px}.home-intro-card__title{font-size:2.15rem}.home-intro-card__meta{flex-wrap:wrap;gap:7px 12px}.home-intro-card__count{top:16px;left:18px}.home-intro-card__arrow--prev{left:12px}.home-intro-card__arrow--next{right:12px}.home-intro-card__dots{bottom:24px}}
</style>
<style scoped>
.home-intro-card--with-cover,
.home-intro-card--with-cover:hover { border: 0; }
</style>
