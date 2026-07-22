<script setup lang="ts">
import { computed } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'

defineProps<{ uploadEnabled?: boolean; uploading?: boolean }>()
const emit = defineEmits<{ insert: [markdown: string], importFile: [], uploadImage: [] }>()
const { t } = useTblogI18n()

const actions = computed(() => [
  { key: 'bold', label: 'B', aria: t('toolbar.bold'), markdown: '**text**' },
  { key: 'italic', label: 'I', aria: t('toolbar.italic'), markdown: '*text*' },
  { key: 'heading', label: 'H2', aria: t('toolbar.heading'), markdown: '## Heading' },
  { key: 'link', label: 'Link', aria: t('toolbar.link'), markdown: '[label](https://example.com)' },
  { key: 'code', label: '<>', aria: t('toolbar.code'), markdown: '`code`' },
  { key: 'list', label: 'List', aria: t('toolbar.list'), markdown: '- item' }
] as const)

function insert(markdown: string) {
  emit('insert', markdown)
}

function insertImage() {
  const url = window.prompt(t('toolbar.imageUrl'))
  if (!url) {
    return
  }
  const alt = window.prompt(t('toolbar.altText')) ?? ''
  emit('insert', `![${alt}](${url})`)
}
</script>

<template>
  <div class="editor-toolbar" role="toolbar" :aria-label="t('toolbar.formatting')">
    <button
      v-for="action in actions"
      :key="action.key"
      type="button"
      class="editor-toolbar__button"
      :aria-label="action.aria"
      :title="action.aria"
      :data-test="`toolbar-${action.key}`"
      @click="insert(action.markdown)"
    >
      {{ action.label }}
    </button>
    <button
      type="button"
      class="editor-toolbar__button"
      :aria-label="t('toolbar.image')"
      :title="t('toolbar.image')"
      data-test="toolbar-image"
      @click="insertImage"
    >
      Img
    </button>
    <button
      v-if="uploadEnabled"
      type="button"
      class="editor-toolbar__button"
      :aria-label="t('toolbar.uploadImage')"
      :title="t('toolbar.uploadImage')"
      data-test="toolbar-upload-image"
      :disabled="uploading"
      @click="emit('uploadImage')"
    >
      {{ uploading ? '…' : 'R2' }}
    </button>
    <span class="editor-toolbar__divider" aria-hidden="true"></span>
    <button
      type="button"
      class="editor-toolbar__button editor-toolbar__button--import"
      :aria-label="t('toolbar.import')"
      :title="t('toolbar.importTitle')"
      data-test="toolbar-import"
      @click="emit('importFile')"
    >
      {{ t('toolbar.importButton') }}
    </button>
  </div>
</template>
