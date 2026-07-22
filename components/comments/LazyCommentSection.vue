<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'

defineProps<{
  slug: string
  turnstileSiteKey?: string | null
}>()

const CommentSection = defineAsyncComponent(() => import('~/components/comments/CommentSection.vue'))
const host = useTemplateRef<HTMLElement>('host')
const ready = shallowRef(false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!host.value) return
  if (typeof IntersectionObserver === 'undefined') {
    ready.value = true
    return
  }

  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    ready.value = true
    observer?.disconnect()
    observer = null
  }, { rootMargin: '600px 0px' })
  observer.observe(host.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="host" class="lazy-comment-section" data-test="lazy-comment-section">
    <CommentSection
      v-if="ready"
      :slug="slug"
      :turnstile-site-key="turnstileSiteKey"
    />
  </div>
</template>
