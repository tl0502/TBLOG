<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  ColorModePreference,
  ResolvedTheme
} from '~/composables/useTblogTheme'
import type { SiteLightTheme } from '~/types/settings'

interface Props {
  theme: ResolvedTheme
  colorMode: ColorModePreference
  lightTheme: SiteLightTheme
}

defineProps<Props>()

// Ambient warm background: drifting gradient (CSS) + mouse-follow glow (JS, rAF-throttled).
// SSR-safe: the layers render server-side; the pointer enhancement attaches on the client.
const rootRef = ref<HTMLElement | null>(null)
let rafId = 0
let pending = false
let targetX = 50
let targetY = 30

function apply() {
  pending = false
  rootRef.value?.style.setProperty('--mx', `${targetX}%`)
  rootRef.value?.style.setProperty('--my', `${targetY}%`)
}

function onPointerMove(event: PointerEvent) {
  targetX = (event.clientX / window.innerWidth) * 100
  targetY = (event.clientY / window.innerHeight) * 100
  if (!pending) {
    pending = true
    rafId = requestAnimationFrame(apply)
  }
}

onMounted(() => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  if (rafId) {
    cancelAnimationFrame(rafId)
  }
})
</script>

<template>
  <div
    ref="rootRef"
    class="ambient"
    :data-theme="theme"
    :data-color-mode="colorMode"
    :data-light-theme="lightTheme"
    aria-hidden="true"
  >
    <div class="ambient__bg"></div>
    <div class="ambient__glow"></div>
    <div class="ambient__stars"></div>
    <div class="ambient__veil"></div>
  </div>
</template>

<style scoped>
.ambient {
  --mx: 50%;
  --my: 30%;
  --ambient-glow: rgba(255, 253, 249, 0.5);
  --ambient-veil: rgba(247, 245, 241, 0.16);
}

.ambient__bg {
  position: fixed;
  inset: 0;
  z-index: -2;
  overflow: hidden;
  background:
    radial-gradient(42vmax 42vmax at 16% 20%, #e3cba6 0%, transparent 64%),
    radial-gradient(38vmax 38vmax at 84% 16%, #f0c6a6 0%, transparent 64%),
    radial-gradient(46vmax 46vmax at 74% 84%, #ddd4b8 0%, transparent 66%),
    radial-gradient(34vmax 34vmax at 22% 88%, #f3d8ad 0%, transparent 64%);
  animation: ambient-drift 16s ease-in-out infinite alternate;
  filter: saturate(1.08);
}

@keyframes ambient-drift {
  0% {
    transform: scale(1.05) translate(-3%, -2%);
  }
  50% {
    transform: scale(1.18) translate(3%, 1%);
  }
  100% {
    transform: scale(1.08) translate(-1%, 3%);
  }
}

.ambient__glow {
  position: fixed;
  inset: 0;
  z-index: -2;
  pointer-events: none;
  background: radial-gradient(22vmax 22vmax at var(--mx) var(--my), var(--ambient-glow) 0%, transparent 60%);
}

.ambient__stars {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0;
  background:
    radial-gradient(circle at 8% 18%, rgba(223, 161, 104, 0.7) 0 1px, transparent 2px),
    radial-gradient(circle at 21% 72%, rgba(142, 177, 184, 0.52) 0 1px, transparent 2px),
    radial-gradient(circle at 37% 34%, rgba(223, 161, 104, 0.38) 0 1px, transparent 2px),
    radial-gradient(circle at 56% 81%, rgba(142, 177, 184, 0.44) 0 1px, transparent 2px),
    radial-gradient(circle at 73% 22%, rgba(223, 161, 104, 0.5) 0 1px, transparent 2px),
    radial-gradient(circle at 91% 61%, rgba(142, 177, 184, 0.52) 0 1px, transparent 2px);
  filter: drop-shadow(0 0 5px rgba(223, 161, 104, 0.3));
  transition: opacity 0.24s ease;
}

.ambient__veil {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: var(--ambient-veil);
}

.ambient[data-theme='atelier'] {
  --ambient-glow: rgba(255, 248, 236, 0.66);
  --ambient-veil: rgba(242, 234, 222, 0.08);
}

.ambient[data-theme='atelier'] .ambient__bg {
  background:
    radial-gradient(44vmax 42vmax at 12% 16%, #d7b98e 0%, transparent 64%),
    radial-gradient(40vmax 38vmax at 88% 10%, #eeb48f 0%, transparent 64%),
    radial-gradient(48vmax 44vmax at 70% 86%, #d3c49d 0%, transparent 67%),
    radial-gradient(34vmax 34vmax at 20% 90%, #edc88d 0%, transparent 64%),
    #e5d8c8;
  filter: saturate(1.16);
}

.ambient[data-theme='nocturne'] {
  --ambient-glow: rgba(76, 112, 121, 0.13);
  --ambient-veil: rgba(5, 9, 12, 0.18);
}

.ambient[data-theme='nocturne'] .ambient__bg {
  background:
    radial-gradient(34vmax 30vmax at 14% 8%, rgba(47, 78, 86, 0.48), transparent 68%),
    radial-gradient(28vmax 24vmax at 88% 4%, rgba(105, 65, 40, 0.34), transparent 70%),
    radial-gradient(40vmax 34vmax at 72% 88%, rgba(32, 53, 61, 0.34), transparent 72%),
    #080c0f;
  filter: saturate(0.92);
}

.ambient[data-theme='nocturne'] .ambient__stars {
  opacity: 0.72;
}

@media (prefers-color-scheme: dark) {
  .ambient[data-color-mode='system'] {
    --ambient-glow: rgba(76, 112, 121, 0.13);
    --ambient-veil: rgba(5, 9, 12, 0.18);
  }

  .ambient[data-color-mode='system'] .ambient__bg {
    background:
      radial-gradient(34vmax 30vmax at 14% 8%, rgba(47, 78, 86, 0.48), transparent 68%),
      radial-gradient(28vmax 24vmax at 88% 4%, rgba(105, 65, 40, 0.34), transparent 70%),
      radial-gradient(40vmax 34vmax at 72% 88%, rgba(32, 53, 61, 0.34), transparent 72%),
      #080c0f;
    filter: saturate(0.92);
  }

  .ambient[data-color-mode='system'] .ambient__stars {
    opacity: 0.72;
  }
}

@media (prefers-color-scheme: light) {
  .ambient[data-color-mode='system'][data-light-theme='atelier'] {
    --ambient-glow: rgba(255, 248, 236, 0.66);
    --ambient-veil: rgba(242, 234, 222, 0.08);
  }

  .ambient[data-color-mode='system'][data-light-theme='atelier'] .ambient__bg {
    background:
      radial-gradient(44vmax 42vmax at 12% 16%, #d7b98e 0%, transparent 64%),
      radial-gradient(40vmax 38vmax at 88% 10%, #eeb48f 0%, transparent 64%),
      radial-gradient(48vmax 44vmax at 70% 86%, #d3c49d 0%, transparent 67%),
      radial-gradient(34vmax 34vmax at 20% 90%, #edc88d 0%, transparent 64%),
      #e5d8c8;
    filter: saturate(1.16);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ambient__bg {
    animation: none;
  }

  .ambient__glow {
    display: none;
  }
}
</style>
