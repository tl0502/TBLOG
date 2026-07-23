<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import ProfileAvatar from '~/components/profile/ProfileAvatar.vue'
import ProfileDetail from '~/components/profile/ProfileDetail.vue'
import ProfileSocialLinks from '~/components/profile/ProfileSocialLinks.vue'
import { useTblogTheme } from '~/composables/useTblogTheme'
import type { PublicProfile } from '~/types/settings'

interface Props {
  profile?: PublicProfile | null
  previewState?: 'closed' | 'open'
}

const props = withDefaults(defineProps<Props>(), { profile: null })
const { resolvedTheme } = useTblogTheme()

const fallbackProfile: PublicProfile = {
  name: 'TBLOG',
  role: 'Independent builder · Writer',
  avatarUrl: null,
  shortBio: '在构建、写作与反复推敲中，记录技术系统背后更长久的思考。',
  signature: '我喜欢把复杂系统整理成能够被理解、使用和长期维护的作品。',
  introduction: '这里记录实现过程，也记录架构决策背后的取舍。相比快速追逐新事物，我更在意一个想法如何逐渐形成自己的结构。',
  topics: ['Cloudflare', 'Content Systems', 'Independent Products'],
  currentStatus: '正在构建 TBLOG',
  location: null,
  socialLinks: [],
  projects: [],
  journeyEnabled: false,
  journey: []
}

const resolvedProfile = computed(() => props.profile ?? fallbackProfile)
const anchor = ref<HTMLElement | null>(null)
const orb = ref<HTMLElement | null>(null)
const orbFace = ref<HTMLElement | null>(null)
const orbControl = ref<HTMLButtonElement | null>(null)
const preview = ref<HTMLElement | null>(null)
const profileLayer = ref<HTMLElement | null>(null)
const previewOpen = ref(false)
const previewStyle = ref<Record<string, string>>({})
const detailOpen = ref(false)
const flashDirection = ref<'open' | 'close' | null>(null)
const previewWasEntered = ref(false)
const isMobile = ref(false)
const reducedMotion = ref(false)
const renderedPreviewOpen = computed(() => props.previewState ? props.previewState === 'open' : previewOpen.value)

const ORB_SENSE_RADIUS = 300
let mediaQuery: MediaQueryList | null = null
let motionQuery: MediaQueryList | null = null
let flashSwitchTimer: number | undefined
let flashEndTimer: number | undefined
let previewClearTimer: number | undefined
let pointerFrame: number | undefined
let latestPointer: { x: number; y: number } | null = null
let returnFocus: HTMLElement | null = null

function resetOrb() {
  if (!orbFace.value) return
  orbFace.value.style.transform = 'translate(6px, 0) scale(0.16, 1)'
  orbFace.value.style.opacity = '0'
}

function renderOrbFace() {
  pointerFrame = undefined
  if (!orb.value || !orbFace.value || !latestPointer) return
  const rect = orb.value.getBoundingClientRect()
  const deltaX = latestPointer.x - (rect.left + rect.width / 2)
  const deltaY = latestPointer.y - (rect.top + rect.height / 2)
  const pixelDistance = Math.hypot(deltaX, deltaY)

  if (pixelDistance > ORB_SENSE_RADIUS) {
    resetOrb()
    return
  }

  const distance = Math.min(1, pixelDistance / ORB_SENSE_RADIUS)
  const vectorLength = Math.max(0.001, pixelDistance)
  const directionX = deltaX / vectorLength
  const directionY = deltaY / vectorLength
  const surfaceDistance = distance * 0.92
  const offsetX = directionX * surfaceDistance * 6
  const offsetY = directionY * surfaceDistance * 5
  const scaleX = Math.max(0.16, Math.sqrt(1 - Math.min(0.98, Math.abs(directionX * surfaceDistance)) ** 2))
  const scaleY = Math.max(0.35, Math.sqrt(1 - Math.min(0.9, Math.abs(directionY * surfaceDistance)) ** 2))

  orbFace.value.style.transform = `translate(${offsetX.toFixed(1)}px, ${offsetY.toFixed(1)}px) scale(${scaleX.toFixed(2)}, ${scaleY.toFixed(2)})`
  orbFace.value.style.opacity = String(Math.max(0.12, Math.min(1, (1 - distance) / 0.72)))
}

function handlePointerMove(event: PointerEvent) {
  latestPointer = { x: event.clientX, y: event.clientY }
  if (pointerFrame === undefined) pointerFrame = window.requestAnimationFrame(renderOrbFace)
}

function showPreview() {
  if (isMobile.value || detailOpen.value) return
  if (previewClearTimer !== undefined) {
    window.clearTimeout(previewClearTimer)
    previewClearTimer = undefined
  }
  previewWasEntered.value = false
  previewOpen.value = true
  nextTick(updatePreviewPosition)
}

function hidePreview() {
  previewOpen.value = false
  previewWasEntered.value = false
  if (previewClearTimer !== undefined) window.clearTimeout(previewClearTimer)
  previewClearTimer = window.setTimeout(() => {
    if (!previewOpen.value) previewStyle.value = {}
    previewClearTimer = undefined
  }, 240)
}

function updatePreviewPosition() {
  if (!previewOpen.value || !anchor.value) return
  const rect = anchor.value.getBoundingClientRect()
  const width = Math.min(390, window.innerWidth - 32)
  const left = Math.min(rect.right + 16, window.innerWidth - width - 16)
  const previewHeight = preview.value?.offsetHeight ?? 0
  const centeredTop = rect.top + (rect.height - previewHeight) / 2
  const topLimit = Math.max(16, window.innerHeight - previewHeight - 16)
  const top = Math.min(Math.max(centeredTop, 16), topLimit)
  previewStyle.value = {
    left: `${Math.max(16, left)}px`,
    top: `${Math.max(16, top)}px`,
    width: `${width}px`
  }
}

function clearFlashTimers() {
  if (flashSwitchTimer !== undefined) window.clearTimeout(flashSwitchTimer)
  if (flashEndTimer !== undefined) window.clearTimeout(flashEndTimer)
  flashSwitchTimer = undefined
  flashEndTimer = undefined
}

function flashOrb(direction: 'open' | 'close', callback: () => void) {
  clearFlashTimers()
  if (previewClearTimer !== undefined) window.clearTimeout(previewClearTimer)
  if (reducedMotion.value) {
    flashDirection.value = null
    callback()
    return
  }

  flashDirection.value = null
  void orb.value?.offsetWidth
  flashDirection.value = direction
  flashSwitchTimer = window.setTimeout(callback, 150)
  flashEndTimer = window.setTimeout(() => { flashDirection.value = null }, 310)
}

function togglePreview(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (props.previewState) return
  const closing = previewOpen.value
  flashOrb(closing ? 'close' : 'open', () => {
    if (isMobile.value) {
      openDetail()
    } else if (previewOpen.value) {
      hidePreview()
    } else {
      showPreview()
    }
  })
}

async function openDetail() {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : orbControl.value
  hidePreview()
  detailOpen.value = true
  document.body.classList.add('profile-modal-open')
  await nextTick()
  profileLayer.value?.querySelector<HTMLElement>('[data-profile-close]')?.focus()
}

function closeDetail() {
  detailOpen.value = false
  document.body.classList.remove('profile-modal-open')
  nextTick(() => returnFocus?.focus({ preventScroll: true }))
}

function handlePreviewEnter() {
  previewWasEntered.value = true
}

function handlePreviewLeave() {
  if (previewWasEntered.value && previewOpen.value) hidePreview()
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!previewOpen.value) return
  const target = event.target as Node
  if (preview.value?.contains(target) || orbControl.value?.contains(target)) return
  hidePreview()
}

function handleLayerPointerDown(event: PointerEvent) {
  if (event.target === event.currentTarget) closeDetail()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (detailOpen.value) closeDetail()
    else if (previewOpen.value) hidePreview()
    return
  }

  if (event.key !== 'Tab' || !detailOpen.value || !profileLayer.value) return
  const focusable = Array.from(profileLayer.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function updateMediaState() {
  isMobile.value = mediaQuery?.matches ?? false
  reducedMotion.value = motionQuery?.matches ?? false
  if (isMobile.value) hidePreview()
}

onMounted(() => {
  mediaQuery = window.matchMedia('(max-width: 860px)')
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  updateMediaState()
  mediaQuery.addEventListener('change', updateMediaState)
  motionQuery.addEventListener('change', updateMediaState)
  document.addEventListener('pointermove', handlePointerMove, { passive: true })
  window.addEventListener('scroll', updatePreviewPosition, { passive: true })
  window.addEventListener('resize', updatePreviewPosition)
  document.documentElement.addEventListener('pointerleave', resetOrb)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  clearFlashTimers()
  if (previewClearTimer !== undefined) window.clearTimeout(previewClearTimer)
  if (pointerFrame !== undefined) window.cancelAnimationFrame(pointerFrame)
  mediaQuery?.removeEventListener('change', updateMediaState)
  motionQuery?.removeEventListener('change', updateMediaState)
  document.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('scroll', updatePreviewPosition)
  window.removeEventListener('resize', updatePreviewPosition)
  document.documentElement.removeEventListener('pointerleave', resetOrb)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
  document.body.classList.remove('profile-modal-open')
})
</script>

<template>
  <div ref="anchor" class="personal-anchor" :data-preview="renderedPreviewOpen">
    <section class="sidebar-card personal-card">
      <div class="personal-card__identity">
        <ProfileAvatar :name="resolvedProfile.name" :src="resolvedProfile.avatarUrl" />
        <div>
          <h2 class="personal-card__name">{{ resolvedProfile.name }}</h2>
          <p class="personal-card__role">{{ resolvedProfile.role }}</p>
        </div>
      </div>
      <p class="personal-card__bio">{{ resolvedProfile.shortBio }}</p>
      <div class="personal-card__footer">
        <span v-if="resolvedProfile.currentStatus" class="personal-card__status">{{ resolvedProfile.currentStatus }}</span>
        <button
          ref="orbControl"
          class="personal-card__hint"
          type="button"
          aria-haspopup="dialog"
          :aria-expanded="renderedPreviewOpen || detailOpen"
          aria-controls="profile-preview"
          :aria-label="renderedPreviewOpen ? '关闭个人资料预览' : '打开个人资料预览'"
          :title="renderedPreviewOpen ? '关闭个人资料预览' : '打开个人资料预览'"
          @click="togglePreview"
        >
          <span
            ref="orb"
            class="personal-card__orb"
            :class="{
              'is-flashing-open': flashDirection === 'open',
              'is-flashing-close': flashDirection === 'close'
            }"
            aria-hidden="true"
          >
            <span ref="orbFace" class="personal-card__face"><span class="personal-card__face-mouth" /></span>
          </span>
        </button>
      </div>
    </section>

    <article
      id="profile-preview"
      ref="preview"
      class="profile-preview"
      :style="previewStyle"
      :aria-hidden="!renderedPreviewOpen"
      aria-label="个人资料预览"
      @pointerenter="handlePreviewEnter"
      @pointerleave="handlePreviewLeave"
      @dblclick="openDetail"
    >
      <button class="profile-preview__expand" type="button" aria-label="展开完整资料" title="展开完整资料" @click="openDetail">↗</button>
      <div class="profile-preview__top">
        <ProfileAvatar :name="resolvedProfile.name" :src="resolvedProfile.avatarUrl" size="preview" />
        <div>
          <h2 class="profile-preview__name">{{ resolvedProfile.name }}</h2>
          <p class="profile-preview__meta">{{ resolvedProfile.role }}<template v-if="resolvedProfile.location"> · {{ resolvedProfile.location }}</template></p>
        </div>
      </div>
      <p class="profile-preview__text">{{ resolvedProfile.shortBio }}</p>
      <ul v-if="resolvedProfile.topics.length" class="profile-preview__topics" aria-label="关注领域">
        <li v-for="topic in resolvedProfile.topics" :key="topic">{{ topic }}</li>
      </ul>
      <ProfileSocialLinks :links="resolvedProfile.socialLinks" label="快速链接" variant="preview" />
    </article>

    <Teleport to="body">
      <Transition name="profile-layer">
        <div
          v-if="detailOpen"
          ref="profileLayer"
          class="profile-layer"
          :data-theme="resolvedTheme"
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-profile-title"
          @pointerdown="handleLayerPointerDown"
        >
          <ProfileDetail :profile="resolvedProfile" title-id="public-profile-title" @close="closeDetail" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.personal-anchor {
  position: relative;
  z-index: 2;
}

.personal-card {
  position: relative;
  width: 100%;
  padding: 20px;
  overflow: hidden;
  isolation: isolate;
}

.personal-card::after {
  position: absolute;
  z-index: -1;
  top: -50px;
  right: -45px;
  width: 130px;
  height: 130px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--color-accent-warm-rgb), 0.13), transparent 68%);
  content: '';
}

/* Preview-open state always highlights; hover lift only on fine pointers. */
.personal-anchor[data-preview='true'] .personal-card {
  border-color: rgba(var(--color-accent-rgb), 0.52);
  box-shadow: var(--shadow-card-hover);
}

@media (hover: hover) and (pointer: fine) {
  .personal-card:hover,
  .personal-anchor[data-preview='true'] .personal-card {
    border-color: rgba(var(--color-accent-rgb), 0.52);
    box-shadow: var(--shadow-card-hover);
  }

  .personal-card:hover {
    transform: translateY(-2px);
  }

  .personal-card__hint:hover .personal-card__orb {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 4px rgba(var(--color-accent-rgb), 0.07);
    transform: scale(1.14);
  }
}

.personal-card__identity {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}

.personal-card__name {
  margin: 0 0 3px;
  font-family: var(--font-display);
  font-size: 1.15rem;
  line-height: 1.2;
}

.personal-card__role {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.79rem;
  line-height: 1.45;
}

.personal-card__bio {
  display: -webkit-box;
  margin: 15px 0 16px;
  overflow: hidden;
  color: var(--color-muted);
  font-size: 0.84rem;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.personal-card__footer {
  display: flex;
  min-height: 30px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.personal-card__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-accent);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: -0.005em;
}

.personal-card__status::before {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 12%, transparent);
  content: '';
}

.personal-card__hint {
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  perspective: 90px;
  place-items: center;
  background: transparent;
  cursor: pointer;
}

.personal-card__hint:focus-visible {
  border-radius: 50%;
  outline: 2px solid rgba(var(--color-accent-rgb), 0.35);
  outline-offset: 2px;
}

.personal-card__orb {
  position: relative;
  display: grid;
  width: 23px;
  height: 23px;
  overflow: hidden;
  border: 1px solid rgba(var(--color-accent-rgb), 0.62);
  border-radius: 50%;
  place-items: center;
  background: transparent;
  transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.personal-card__orb::after {
  position: absolute;
  z-index: 2;
  top: -5px;
  bottom: -5px;
  left: -12px;
  width: 7px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.92), transparent);
  content: '';
  opacity: 0;
  pointer-events: none;
  transform: translateX(-12px) skewX(-18deg);
}

.personal-card__orb.is-flashing-open::after {
  animation: orb-card-sheen-open 300ms ease-out;
}

.personal-card__orb.is-flashing-close::after {
  animation: orb-card-sheen-close 220ms ease-out;
}

.personal-card__face {
  position: relative;
  display: block;
  width: 11px;
  height: 10px;
  opacity: 0;
  transform: translate(6px, 0) scale(0.16, 1);
  transform-origin: center;
  transition: transform 45ms linear, opacity 45ms linear;
}

.personal-card__face::before,
.personal-card__face::after {
  position: absolute;
  top: 2px;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: var(--color-accent);
  content: '';
}

.personal-card__face::before { left: 1px; }
.personal-card__face::after { right: 1px; }

.personal-card__face-mouth {
  position: absolute;
  right: 2px;
  bottom: 0;
  left: 2px;
  height: 4px;
  border-bottom: 1.25px solid var(--color-accent);
  border-radius: 0 0 8px 8px;
}

@keyframes orb-card-sheen-open {
  0% { opacity: 0; transform: translateX(-12px) skewX(-18deg); }
  18%, 70% { opacity: 0.95; }
  100% { opacity: 0; transform: translateX(42px) skewX(-18deg); }
}

@keyframes orb-card-sheen-close {
  0% { opacity: 0; transform: translateX(42px) skewX(-18deg); }
  18%, 70% { opacity: 0.95; }
  100% { opacity: 0; transform: translateX(-12px) skewX(-18deg); }
}

.profile-preview {
  position: fixed;
  z-index: 5;
  top: 0;
  left: 0;
  width: 390px;
  padding: 22px;
  overflow: visible;
  visibility: hidden;
  border: 1px solid rgba(var(--color-accent-rgb), 0.34);
  border-radius: 22px;
  opacity: 0;
  background: var(--color-page);
  box-shadow: 0 32px 86px rgba(var(--color-text-rgb), 0.22);
  pointer-events: none;
  transform: translate(-6px, 5px);
  transform-origin: left center;
  transition: opacity 150ms ease, transform 170ms ease, visibility 0s linear 170ms;
}

.personal-anchor[data-preview='true'] .profile-preview {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
  transform: none;
  transition: opacity 190ms ease, transform 220ms cubic-bezier(.2,.8,.2,1), visibility 0s linear 0s;
}

.profile-preview__expand {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 30px;
  min-height: 30px;
  padding: 0;
  border: 0;
  color: var(--color-muted);
  font-size: 1rem;
  background: transparent;
  opacity: 0.72;
  cursor: pointer;
}

.profile-preview__expand:hover,
.profile-preview__expand:focus-visible {
  color: var(--color-accent);
  opacity: 1;
  outline: none;
  transform: translate(1px, -1px);
}

.profile-preview__top {
  display: flex;
  gap: 16px;
  align-items: center;
  padding-right: 22px;
}

.profile-preview__top > div {
  min-width: 0;
}

.profile-preview__name {
  margin: 0 0 4px;
  font-family: var(--font-display);
  font-size: 1.38rem;
  overflow-wrap: anywhere;
}

.profile-preview__meta {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}

.profile-preview__text {
  margin: 18px 0;
  color: var(--color-muted);
  font-size: 0.88rem;
  line-height: 1.72;
  overflow-wrap: anywhere;
}

.profile-preview__topics {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.profile-preview__topics li {
  max-width: 100%;
  padding: 5px 9px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  color: var(--color-muted);
  font-size: 0.72rem;
  background: rgba(var(--color-accent-rgb), 0.04);
  overflow-wrap: anywhere;
}

.profile-layer {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  padding: 42px;
  place-items: center;
  background: rgba(var(--color-text-rgb), 0.23);
  -webkit-backdrop-filter: blur(10px) saturate(0.86);
  backdrop-filter: blur(10px) saturate(0.86);
}

.profile-layer[data-theme='atelier'] {
  --color-page: #f1ece4;
  --color-page-rgb: 241, 236, 228;
  --color-panel: rgba(255, 252, 246, 0.84);
  --color-panel-strong: #fffaf2;
  --color-panel-rgb: 255, 252, 246;
  --color-text: #2b343b;
  --color-text-rgb: 43, 52, 59;
  --color-muted: #6d7478;
  --color-line: #d8c6b2;
  --color-accent: #8d6b52;
  --color-accent-rgb: 141, 107, 82;
  --color-accent-warm: #b5613c;
  --color-accent-warm-rgb: 181, 97, 60;
}

.profile-layer[data-theme='nocturne'] {
  --color-page: #0e1418;
  --color-page-rgb: 14, 20, 24;
  --color-panel: rgba(21, 30, 36, 0.76);
  --color-panel-strong: #1b252b;
  --color-panel-rgb: 21, 30, 36;
  --color-text: #e2e3de;
  --color-text-rgb: 226, 227, 222;
  --color-muted: #929fa4;
  --color-line: rgba(177, 198, 203, 0.18);
  --color-accent: #76a0a8;
  --color-accent-rgb: 118, 160, 168;
  --color-accent-warm: #dfa168;
  --color-accent-warm-rgb: 223, 161, 104;
}

.profile-layer-enter-active,
.profile-layer-leave-active {
  transition: opacity 180ms ease;
}

.profile-layer-enter-active :deep(.profile-detail),
.profile-layer-leave-active :deep(.profile-detail) {
  transition: opacity 210ms ease, transform 240ms cubic-bezier(.2,.8,.2,1);
}

.profile-layer-enter-from,
.profile-layer-leave-to,
.profile-layer-enter-from :deep(.profile-detail),
.profile-layer-leave-to :deep(.profile-detail) {
  opacity: 0;
}

.profile-layer-enter-from :deep(.profile-detail),
.profile-layer-leave-to :deep(.profile-detail) {
  transform: translateY(12px) scale(0.985);
}

:global(body.profile-modal-open) {
  overflow: hidden;
}

@media (max-width: 860px) {
  .personal-anchor {
    width: min(100%, 480px);
  }

  .profile-preview {
    display: none;
  }
}

@media (max-width: 620px) {
  .profile-layer {
    padding: 10px;
    place-items: stretch;
  }
}

@media (prefers-reduced-motion: reduce) {
  .personal-card,
  .personal-card__orb,
  .personal-card__face,
  .profile-preview,
  .profile-layer-enter-active,
  .profile-layer-leave-active,
  .profile-layer-enter-active :deep(.profile-detail),
  .profile-layer-leave-active :deep(.profile-detail) {
    animation: none !important;
    transition: none !important;
    transform: none !important;
  }
}
</style>
