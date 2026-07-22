<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import ArticleAssistRail from '~/components/article/ArticleAssistRail.vue'
import ArticleBody from '~/components/article/ArticleBody.vue'
import ArticleHero from '~/components/article/ArticleHero.vue'
import AssistRailHandle from '~/components/article/AssistRailHandle.vue'
import LazyCommentSection from '~/components/comments/LazyCommentSection.vue'
import MobileTocEntry from '~/components/article/MobileTocEntry.vue'
import { usePostDetail } from '~/composables/usePublicApi'
import { useArticleSeo } from '~/composables/useSeo'
import { parseToc } from '~/utils/parse-toc'
import { formatPublishedDate } from '~/utils/format-date'
import { useOptionalPublicSiteConfigData } from '~/composables/useSiteConfig'
import { usePublicImages } from '~/composables/usePublicImages'
import { isPublicNotFoundError } from '~/utils/public-errors'

const route = useRoute()
definePageMeta({ key: route => String(route.params.slug) })
// Slug keys isolate articles without remounting the page for query/hash-only navigation.
const slug = computed(() => String(route.params.slug))

const { data, error } = await usePostDetail(slug)

// Not-found must be a real 404 (not an HTTP-200 message) for the initial server-rendered request.
if (error.value && isPublicNotFoundError(error.value)) {
  throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
}
if (error.value && import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 503, 'Post temporarily unavailable')
}
if (error.value && import.meta.client && !useNuxtApp().isHydrating) {
  throw createError({ statusCode: 503, statusMessage: 'Post temporarily unavailable', fatal: true })
}
if (!error.value && !data.value?.data) {
  throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
}

const post = computed(() => data.value?.data ?? null)
const toc = computed(() => parseToc(post.value?.tocJson ?? null))
const publishedDate = computed(() => (post.value ? formatPublishedDate(post.value.publishedAt) : ''))
const siteConfigData = useOptionalPublicSiteConfigData()
const commentsEnabled = computed(() => siteConfigData.value?.data.comment.enabled === true)
const turnstileSiteKey = computed(() => siteConfigData.value?.data.comment.protection?.siteKey ?? null)
const pageViews = computed(() => post.value?.pageViews ?? null)
const publicImages = usePublicImages()
const coverUrl = computed(() => post.value?.cover ? publicImages.variant(post.value.cover, 'medium') : null)
const coverSrcset = computed(() => post.value?.cover ? publicImages.srcset(post.value.cover) : null)

// Per-post SEO: metadata fallbacks, canonical override, Open Graph image, and Article JSON-LD.
useArticleSeo(post)

// Desktop rail starts open; the edge handle collapses/expands it.
const railOpen = shallowRef(true)
const readingFrame = useTemplateRef<HTMLElement>('readingFrame')
const handleVisible = shallowRef(false)
const handleTop = shallowRef(0)
let handleFrame = 0
let desktopQuery: MediaQueryList | null = null
let handleListenersActive = false

function updateHandleBoundary() {
  handleFrame = 0
  const frame = readingFrame.value
  if (!frame) return

  const bounds = frame.getBoundingClientRect()
  const handleHeight = 112
  const viewportTop = (window.innerHeight - handleHeight) / 2
  const minTop = Math.max(0, bounds.top)
  const maxTop = Math.min(window.innerHeight - handleHeight, bounds.bottom - handleHeight)

  handleVisible.value = bounds.bottom > 0 && bounds.top < window.innerHeight && maxTop >= minTop
  handleTop.value = Math.min(Math.max(viewportTop, minTop), maxTop)
}

function scheduleHandleBoundaryUpdate() {
  if (handleFrame) return
  handleFrame = window.requestAnimationFrame(updateHandleBoundary)
}

function startHandleTracking() {
  if (handleListenersActive) return
  handleListenersActive = true
  updateHandleBoundary()
  window.addEventListener('scroll', scheduleHandleBoundaryUpdate, { passive: true })
  window.addEventListener('resize', scheduleHandleBoundaryUpdate, { passive: true })
}

function stopHandleTracking() {
  if (handleListenersActive) {
    handleListenersActive = false
    window.removeEventListener('scroll', scheduleHandleBoundaryUpdate)
    window.removeEventListener('resize', scheduleHandleBoundaryUpdate)
  }
  if (handleFrame) {
    window.cancelAnimationFrame(handleFrame)
    handleFrame = 0
  }
  handleVisible.value = false
}

function syncHandleTracking(event?: MediaQueryListEvent) {
  const isDesktop = event?.matches ?? Boolean(desktopQuery?.matches)
  if (isDesktop) startHandleTracking()
  else stopHandleTracking()
}

onMounted(() => {
  desktopQuery = window.matchMedia('(min-width: 1180px)')
  syncHandleTracking()
  desktopQuery.addEventListener('change', syncHandleTracking)
})

onBeforeUnmount(() => {
  desktopQuery?.removeEventListener('change', syncHandleTracking)
  stopHandleTracking()
  desktopQuery = null
})
</script>

<template>
  <div v-if="post" class="post-detail">
    <div
      class="post-detail__stage"
      :class="{ 'post-detail__stage--with-comments': post.type === 'article' }"
    >
      <article class="post-detail__article">
        <ArticleHero
          :post="post"
          :published-date="publishedDate"
          :cover-url="coverUrl"
          :cover-srcset="coverSrcset"
          :page-views="pageViews"
        />

        <div
          ref="readingFrame"
          class="post-detail__reading-frame"
          :class="{ 'post-detail__reading-frame--with-rail': railOpen }"
        >
          <div class="post-detail__content">
            <MobileTocEntry v-if="toc.length" class="post-detail__mobile-toc" :toc="toc" />

            <ArticleBody :html="post.html" :code-meta="post.codeMeta" />
          </div>

          <div class="post-detail__rail-slot">
            <ArticleAssistRail
              class="post-detail__rail"
              :toc="toc"
              :published-at="post.publishedAt"
              :reading-time="post.readingTime"
              :tags="post.tags"
              :open="railOpen"
            />
          </div>
        </div>
      </article>
    </div>

    <div v-if="post.type === 'article' && commentsEnabled" class="post-detail__comments">
      <ClientOnly>
        <LazyCommentSection
          :key="post.slug"
          :slug="post.slug"
          :turnstile-site-key="turnstileSiteKey"
        />
      </ClientOnly>
    </div>

    <AssistRailHandle
      v-show="handleVisible"
      :open="railOpen"
      :style="{ top: `${handleTop}px` }"
      @toggle="railOpen = !railOpen"
    />
  </div>

  <div v-else class="container post-detail">
    <p class="post-detail__empty">Post not found.</p>
  </div>
</template>

<style scoped>
.post-detail {
  padding-block-start: 28px;
}

.post-detail__stage {
  width: min(calc(100% - 56px), 1180px);
  margin: 0 auto 72px;
}

.post-detail__stage--with-comments {
  margin-bottom: 18px;
}

.post-detail__article {
  min-width: 0;
}

.post-detail__reading-frame {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 760px);
  align-items: stretch;
  justify-content: center;
  gap: clamp(18px, 2vw, 28px);
  margin-top: 10px;
  padding: clamp(22px, 2.7vw, 32px);
  border: 0;
  border-radius: 22px;
  background: rgba(var(--color-panel-rgb), 0.34);
  transition: grid-template-columns 0.28s cubic-bezier(0.2, 0.7, 0.2, 1);
}

.post-detail__reading-frame::before {
  position: absolute;
  right: clamp(20px, 4vw, 48px);
  bottom: 100%;
  left: clamp(20px, 4vw, 48px);
  height: 18px;
  pointer-events: none;
  border-radius: 999px 999px 0 0;
  background: linear-gradient(
    to bottom,
    rgba(var(--color-panel-rgb), 0),
    rgba(var(--color-panel-rgb), 0.3)
  );
  content: '';
  filter: blur(4px);
}

.post-detail__reading-frame--with-rail {
  grid-template-columns: minmax(0, 760px) minmax(220px, 270px);
}

.post-detail__content {
  min-width: 0;
}

.post-detail__mobile-toc {
  display: none;
  margin-bottom: 28px;
}

.post-detail__rail-slot {
  align-self: stretch;
  min-width: 0;
  contain: size;
}

.post-detail__reading-frame:not(.post-detail__reading-frame--with-rail) .post-detail__rail-slot {
  display: none;
}

.post-detail__rail {
  width: min(100%, 270px);
  max-height: min(calc(100vh - 116px), 100%);
}

.post-detail__comments {
  width: min(calc(100% - 56px), 1180px);
  margin: 0 auto 72px;
  padding: 30px 0 0;
}

.post-detail__article :deep(.article-hero) {
  margin-bottom: 0;
  border-radius: 22px;
  box-shadow: 0 10px 28px rgba(var(--color-text-rgb), 0.045);
}

.post-detail__comments :deep(.comment-section) {
  width: min(100%, 760px);
  margin-inline: auto;
  padding-top: 0;
  border-top: 0;
}

.post-detail__empty {
  color: var(--color-muted);
}

.post-detail__article :deep(.article-body :is(h2, h3)) {
  scroll-margin-top: 24px;
}

@media (max-width: 1179px) {
  .post-detail__stage {
    width: min(calc(100% - 48px), 808px);
  }

  .post-detail__reading-frame {
    display: block;
  }

  .post-detail__reading-frame:not(.post-detail__reading-frame--with-rail) .post-detail__rail-slot {
    display: block;
  }

  .post-detail__mobile-toc {
    display: block;
  }
}

@media (max-width: 640px) {
  .post-detail {
    padding-block-start: 20px;
  }

  .post-detail__stage {
    width: calc(100% - 36px);
  }

  .post-detail__reading-frame {
    padding: 22px 18px;
    border-radius: 20px;
  }

  .post-detail__comments {
    width: calc(100% - 36px);
    margin-top: 0;
    margin-bottom: 54px;
    padding-top: 22px;
  }
}
</style>
