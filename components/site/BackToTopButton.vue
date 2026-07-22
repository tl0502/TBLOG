<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'

const { t } = useTblogI18n()
const visible = ref(false)
const bottomOffset = ref(24)

function updatePosition() {
  visible.value = window.scrollY > 480
  const baseOffset = window.innerWidth <= 640 ? 18 : 24
  const footer = document.querySelector<HTMLElement>('.site-footer')
  if (!footer) {
    bottomOffset.value = baseOffset
    return
  }

  const footerOverlap = Math.max(0, window.innerHeight - footer.getBoundingClientRect().top)
  bottomOffset.value = Math.max(baseOffset, footerOverlap + 12)
}

function backToTop() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
}

onMounted(() => {
  updatePosition()
  window.addEventListener('scroll', updatePosition, { passive: true })
  window.addEventListener('resize', updatePosition)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updatePosition)
  window.removeEventListener('resize', updatePosition)
})
</script>

<template>
  <Transition name="back-to-top">
    <button
      v-if="visible"
      type="button"
      class="back-to-top"
      :style="{ bottom: `${bottomOffset}px` }"
      :aria-label="t('common.backToTop')"
      :title="t('common.backToTop')"
      @click="backToTop"
    >
      <span aria-hidden="true">↑</span>
    </button>
  </Transition>
</template>

<style scoped>
.back-to-top {
  position: fixed;
  right: max(20px, calc((100vw - 1240px) / 2));
  z-index: 35;
  display: grid;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 1px solid rgba(var(--color-accent-rgb), 0.3);
  border-radius: 50%;
  color: var(--color-accent);
  background: rgba(var(--color-panel-rgb), 0.88);
  box-shadow: 0 12px 30px rgba(var(--color-text-rgb), 0.14);
  backdrop-filter: blur(12px);
  cursor: pointer;
  place-items: center;
  transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.back-to-top span {
  font: 700 1rem/1 Arial, sans-serif;
}

.back-to-top:hover,
.back-to-top:focus-visible {
  border-color: var(--color-accent);
  color: #fff;
  background: var(--color-accent);
  transform: translateY(-3px);
}

.back-to-top-enter-active,
.back-to-top-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.back-to-top-enter-from,
.back-to-top-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.92);
}

@media (max-width: 640px) {
  .back-to-top {
    right: 16px;
    width: 38px;
    height: 38px;
  }
}
</style>
