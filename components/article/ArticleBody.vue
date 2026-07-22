<script setup lang="ts">
import { computed, nextTick, toRef, useTemplateRef, watch } from 'vue'
import type { CodeBlockMetaView } from '~/types/public-view'
import { useCodeBlockEnhancements } from '~/composables/useCodeBlockEnhancements'
import { usePublicImages } from '~/composables/usePublicImages'
import { withArticleImageLoadingHints } from '~/utils/article-html'

interface Props {
  html: string
  codeMeta: CodeBlockMetaView[]
}

const props = defineProps<Props>()

// `html` is the server-sanitised, server-highlighted stored output — no client Markdown.
const renderedHtml = computed(() => withArticleImageLoadingHints(props.html))
const body = useTemplateRef<HTMLElement>('body')
useCodeBlockEnhancements(body, toRef(props, 'html'), toRef(props, 'codeMeta'))
const images = usePublicImages()

function applyImageVariants() {
  if (!body.value || !images.templates.value) return
  for (const image of body.value.querySelectorAll<HTMLImageElement>('img[src]')) {
    const source = image.dataset.tblogOriginalSrc ?? image.getAttribute('src')
    if (!source) continue
    image.dataset.tblogOriginalSrc = source
    image.src = images.variant(source, 'large')
    const srcset = images.srcset(source)
    if (srcset) image.srcset = srcset
    image.sizes = '(max-width: 760px) 100vw, 760px'
  }
}

watch([body, images.templates, () => props.html], () => void nextTick(applyImageVariants))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div ref="body" class="article-body" v-html="renderedHtml" />
</template>
