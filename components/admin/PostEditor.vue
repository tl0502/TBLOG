<script lang="ts">
import type { AdminPostStatus, AdminPostType } from '~/composables/useAdminApi'
import type { PostMetadataModel, TaxonomyOption } from './PostMetadataPanel.vue'

export interface PostEditorInitialPost {
  title: string
  type: AdminPostType
  status: AdminPostStatus
  featured: boolean
  slug: string
  cover: string | null
  customExcerpt: string | null
  categoryId: string | null
  tagIds: string[]
  markdown: string
  seoTitle: string | null
  seoDescription: string | null
  canonicalUrlOverride: string | null
  openGraphImageUrl: string | null
  twitterImageUrl: string | null
  jsonLdOverrideJson: string | null
}

export interface PostEditorSavePayload extends PostEditorInitialPost {}

export type PreviewMarkdown = (markdown: string) => Promise<{ html: string }>
export type UploadMedia = (file: File, altText?: string) => Promise<{ url: string }>
</script>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, shallowRef, useTemplateRef, watch } from 'vue'
import EditorToolbar from '~/components/admin/EditorToolbar.vue'
import PostMetadataPanel from '~/components/admin/PostMetadataPanel.vue'
import { slugify } from '~/utils/slugify'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  initialPost: PostEditorInitialPost
  categories: TaxonomyOption[]
  tags: TaxonomyOption[]
  previewMarkdown: PreviewMarkdown
  previewDelay?: number
  saving?: boolean
  mediaUploadEnabled?: boolean
  uploadMedia?: UploadMedia
}

const props = withDefaults(defineProps<Props>(), {
  previewDelay: 400,
  saving: false,
  mediaUploadEnabled: false,
  uploadMedia: undefined
})
const emit = defineEmits<{
  save: [payload: PostEditorSavePayload]
  statusChange: [status: AdminPostStatus, payload: PostEditorSavePayload]
}>()
const { formatNumber, t } = useTblogI18n()

const markdownInput = useTemplateRef<HTMLTextAreaElement>('markdownInput')
const markdownFileInput = useTemplateRef<HTMLInputElement>('markdownFileInput')
const imageFileInput = useTemplateRef<HTMLInputElement>('imageFileInput')
const coverFileInput = useTemplateRef<HTMLInputElement>('coverFileInput')
const editorWorkspace = useTemplateRef<HTMLDivElement>('editorWorkspace')
const form = reactive<PostEditorInitialPost>({ ...props.initialPost })
// A post that already has a slug (editing) keeps it; a new, empty-slug post
// follows the title until the author edits the slug field themselves.
const slugManuallyEdited = shallowRef(Boolean(props.initialPost.slug))
const previewHtml = shallowRef('')
const previewError = shallowRef('')
const showPreview = shallowRef(true)
const uploadingMedia = shallowRef(false)
const mediaUploadError = shallowRef('')
const splitPercent = shallowRef(56)
const resizing = shallowRef(false)

let previewTimer: number | null = null
let previewInFlight = false
let queuedMarkdown: string | null = null
let mounted = false
let disposed = false
let previewRevision = 0
let lastPreviewedMarkdown: string | null = null
const MIN_SPLIT_PERCENT = 30
const MAX_SPLIT_PERCENT = 70

const metadata = computed<PostMetadataModel>({
  get() {
    return {
      type: form.type,
      slug: form.slug,
      cover: form.cover,
      categoryId: form.categoryId,
      tagIds: form.tagIds,
      status: form.status,
      featured: form.featured,
      seoTitle: form.seoTitle,
      seoDescription: form.seoDescription,
      canonicalUrlOverride: form.canonicalUrlOverride,
      openGraphImageUrl: form.openGraphImageUrl,
      twitterImageUrl: form.twitterImageUrl,
      jsonLdOverrideJson: form.jsonLdOverrideJson
    }
  },
  set(value) {
    if (value.slug !== form.slug) {
      // A user edit to the slug pins it; clearing the field re-enables auto-fill.
      slugManuallyEdited.value = value.slug.trim().length > 0
    }
    form.slug = value.slug
    form.cover = value.cover
    form.categoryId = value.categoryId
    form.tagIds = value.tagIds
    form.status = value.status
    form.featured = value.status === 'draft' ? false : value.featured
    form.seoTitle = value.seoTitle
    form.seoDescription = value.seoDescription
    form.canonicalUrlOverride = value.canonicalUrlOverride
    form.openGraphImageUrl = value.openGraphImageUrl
    form.twitterImageUrl = value.twitterImageUrl
    form.jsonLdOverrideJson = value.jsonLdOverrideJson
  }
})

const nextStatus = computed<AdminPostStatus>(() => form.status === 'published' ? 'draft' : 'published')
const statusButtonLabel = computed(() => form.status === 'published' ? t('editor.unpublish') : t('editor.publish'))
const currentStatusLabel = computed(() => form.status === 'published' ? t('editor.published') : t('editor.draft'))

function buildPayload(): PostEditorSavePayload {
  return { ...form, tagIds: [...form.tagIds] }
}

function save() {
  emit('save', buildPayload())
}

function changeStatus() {
  form.status = nextStatus.value
  if (form.status === 'draft') {
    form.featured = false
  }
  emit('statusChange', form.status, buildPayload())
}

function insertMarkdown(snippet: string) {
  const input = markdownInput.value
  const start = input?.selectionStart ?? form.markdown.length
  const end = input?.selectionEnd ?? form.markdown.length
  form.markdown = `${form.markdown.slice(0, start)}${snippet}${form.markdown.slice(end)}`

  nextTick(() => {
    const caret = start + snippet.length
    input?.focus()
    input?.setSelectionRange(caret, caret)
  })
}

function openMarkdownImport() {
  markdownFileInput.value?.click()
}

async function importMarkdown(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (form.markdown.trim() && !window.confirm(t('editor.replaceImport'))) {
    return
  }

  form.markdown = await file.text()
  nextTick(() => markdownInput.value?.focus())
}

function openImageUpload() {
  imageFileInput.value?.click()
}

function openCoverUpload() {
  coverFileInput.value?.click()
}

async function uploadSelectedImage(event: Event, target: 'body' | 'cover') {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !props.uploadMedia || uploadingMedia.value) return

  uploadingMedia.value = true
  mediaUploadError.value = ''
  const altText = file.name.replace(/\.[^.]+$/, '')
  try {
    const uploaded = await props.uploadMedia(file, altText)
    if (target === 'cover') {
      form.cover = uploaded.url
    } else {
      insertMarkdown(`![${altText}](${uploaded.url})`)
    }
  } catch {
    mediaUploadError.value = t('editor.uploadError')
  } finally {
    uploadingMedia.value = false
  }
}

async function runPreview(markdown: string) {
  if (disposed || !showPreview.value) {
    return
  }

  if (!markdown.trim()) {
    previewRevision += 1
    queuedMarkdown = null
    lastPreviewedMarkdown = null
    previewHtml.value = ''
    previewError.value = ''
    return
  }

  if (markdown === lastPreviewedMarkdown) {
    return
  }

  if (previewInFlight) {
    queuedMarkdown = markdown
    return
  }

  previewInFlight = true
  previewError.value = ''
  const revision = ++previewRevision

  try {
    const result = await props.previewMarkdown(markdown)
    if (
      !disposed &&
      showPreview.value &&
      revision === previewRevision &&
      form.markdown === markdown
    ) {
      previewHtml.value = result.html
      lastPreviewedMarkdown = markdown
    }
  } catch {
    if (
      !disposed &&
      showPreview.value &&
      revision === previewRevision &&
      form.markdown === markdown
    ) {
      previewError.value = t('editor.previewError')
    }
  } finally {
    previewInFlight = false
    const next = queuedMarkdown
    queuedMarkdown = null
    if (
      !disposed &&
      showPreview.value &&
      next !== null &&
      (next !== markdown || revision !== previewRevision)
    ) {
      await runPreview(next)
    }
  }
}

function schedulePreview(markdown: string) {
  if (disposed || !showPreview.value) {
    return
  }

  if (previewTimer) {
    window.clearTimeout(previewTimer)
  }

  if (!markdown.trim()) {
    previewTimer = null
    void runPreview(markdown)
    return
  }

  if (markdown === lastPreviewedMarkdown) {
    previewTimer = null
    return
  }

  previewTimer = window.setTimeout(() => {
    previewTimer = null
    void runPreview(markdown)
  }, props.previewDelay)
}

function setSplitPercent(value: number) {
  splitPercent.value = Math.min(MAX_SPLIT_PERCENT, Math.max(MIN_SPLIT_PERCENT, value))
}

function resizeFromPointer(clientX: number) {
  const workspace = editorWorkspace.value
  if (!workspace) return
  const bounds = workspace.getBoundingClientRect()
  if (bounds.width === 0) return
  setSplitPercent(((clientX - bounds.left) / bounds.width) * 100)
}

function continueResize(event: PointerEvent) {
  if (resizing.value) resizeFromPointer(event.clientX)
}

function stopResize() {
  resizing.value = false
  window.removeEventListener('pointermove', continueResize)
  window.removeEventListener('pointerup', stopResize)
}

function startResize(event: PointerEvent) {
  resizing.value = true
  resizeFromPointer(event.clientX)
  window.addEventListener('pointermove', continueResize)
  window.addEventListener('pointerup', stopResize)
}

function resizeWithKeyboard(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    setSplitPercent(splitPercent.value - 2)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    setSplitPercent(splitPercent.value + 2)
  } else if (event.key === 'Home') {
    event.preventDefault()
    setSplitPercent(MIN_SPLIT_PERCENT)
  } else if (event.key === 'End') {
    event.preventDefault()
    setSplitPercent(MAX_SPLIT_PERCENT)
  }
}

watch(
  () => form.markdown,
  (markdown) => {
    if (mounted && showPreview.value) {
      schedulePreview(markdown)
    }
  }
)

watch(showPreview, (visible) => {
  if (!visible) {
    if (previewTimer) {
      window.clearTimeout(previewTimer)
      previewTimer = null
    }
    queuedMarkdown = null
    previewRevision += 1
    return
  }

  schedulePreview(form.markdown)
})

// Keep the slug in sync with the title until the author edits the slug directly.
// Non-Latin titles (e.g. Chinese) slugify to '' — the server then asks for a manual slug.
watch(
  () => form.title,
  (title) => {
    if (!slugManuallyEdited.value) {
      form.slug = slugify(title)
    }
  }
)

onMounted(() => {
  mounted = true
  schedulePreview(form.markdown)
})

onUnmounted(() => {
  disposed = true
  previewRevision += 1
  queuedMarkdown = null
  if (previewTimer) {
    window.clearTimeout(previewTimer)
  }
  stopResize()
})
</script>

<template>
  <form class="post-editor" @submit.prevent="save">
    <div class="post-editor__topbar">
      <div class="post-editor__heading">
        <div class="post-editor__context">
          <span class="post-editor__document-type">{{ form.type === 'article' ? 'ARTICLE' : 'PAGE' }}</span>
          <span class="post-editor__status" :class="`is-${form.status}`">
            <span aria-hidden="true"></span>
            {{ currentStatusLabel }}
          </span>
        </div>
        <label class="post-editor__title-field">
          <span class="post-editor__label">{{ t('editor.title') }}</span>
          <input
            v-model="form.title"
            data-test="post-editor-title"
            class="post-editor__title-input"
          >
        </label>
        <label class="post-editor__excerpt-field">
          <span class="post-editor__label">{{ t('editor.customExcerpt') }}</span>
          <textarea
            v-model="form.customExcerpt"
            data-test="post-editor-custom-excerpt"
            class="post-editor__excerpt-input"
            :placeholder="t('editor.customExcerptPlaceholder')"
            maxlength="500"
            rows="2"
          />
          <span class="post-editor__hint">{{ t('editor.customExcerptHint') }}</span>
        </label>
      </div>
      <div class="post-editor__actions">
        <button
          type="button"
          class="post-editor__secondary"
          :class="{ 'is-active': showPreview }"
          :aria-pressed="showPreview"
          @click="showPreview = !showPreview"
        >
          {{ t('editor.preview') }}
        </button>
        <button
          type="button"
          class="post-editor__secondary"
          @click="changeStatus"
        >
          {{ statusButtonLabel }}
        </button>
        <button
          type="button"
          data-test="post-editor-save"
          class="post-editor__primary"
          :disabled="saving"
          @click="save"
        >
          {{ t('common.save') }}
        </button>
      </div>
    </div>

    <div class="post-editor__body">
      <PostMetadataPanel
        v-model="metadata"
        :categories="categories"
        :tags="tags"
        :upload-enabled="props.mediaUploadEnabled"
        :uploading="uploadingMedia"
        @upload-cover="openCoverUpload"
      />

      <div
        ref="editorWorkspace"
        class="post-editor__workspace"
        :class="{ 'is-resizing': resizing, 'is-preview-hidden': !showPreview }"
        :style="{ '--editor-split': `${splitPercent}%` }"
      >
        <section class="post-editor__write" :aria-label="t('editor.markdown')">
        <div class="post-editor__pane-head">
          <div>
            <strong>Markdown</strong>
            <span>{{ t('editor.characters', { count: formatNumber(form.markdown.length) }) }}</span>
          </div>
          <span>.md</span>
        </div>
        <EditorToolbar
          :upload-enabled="props.mediaUploadEnabled"
          :uploading="uploadingMedia"
          @insert="insertMarkdown"
          @import-file="openMarkdownImport"
          @upload-image="openImageUpload"
        />
        <input
          ref="markdownFileInput"
          data-test="post-editor-file-input"
          class="post-editor__file-input"
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          @change="importMarkdown"
        >
        <input
          ref="imageFileInput"
          data-test="post-editor-image-input"
          class="post-editor__file-input"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          @change="uploadSelectedImage($event, 'body')"
        >
        <input
          ref="coverFileInput"
          data-test="post-editor-cover-input"
          class="post-editor__file-input"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          @change="uploadSelectedImage($event, 'cover')"
        >
        <p v-if="mediaUploadError" class="post-editor__preview-error" role="alert">
          {{ mediaUploadError }}
        </p>
        <textarea
          ref="markdownInput"
          v-model="form.markdown"
          data-test="post-editor-markdown"
          class="post-editor__textarea"
          :placeholder="t('editor.placeholder')"
          spellcheck="true"
        />
        </section>

        <div
          v-show="showPreview"
          class="post-editor__resizer"
          role="separator"
          tabindex="0"
          aria-orientation="vertical"
          :aria-label="`${t('editor.markdown')} / ${t('editor.preview')}`"
          :aria-valuenow="Math.round(splitPercent)"
          :aria-valuemin="MIN_SPLIT_PERCENT"
          :aria-valuemax="MAX_SPLIT_PERCENT"
          data-test="post-editor-resizer"
          @pointerdown.prevent="startResize"
          @keydown="resizeWithKeyboard"
        >
          <span aria-hidden="true"></span>
        </div>

        <section
          v-show="showPreview"
          class="post-editor__preview"
          :aria-label="t('editor.preview')"
        >
        <div class="post-editor__pane-head">
          <div>
            <strong>{{ t('editor.preview') }}</strong>
            <span>{{ t('editor.previewOutput') }}</span>
          </div>
          <span>{{ t('editor.live') }}</span>
        </div>
        <p v-if="previewError" class="post-editor__preview-error">{{ previewError }}</p>
        <p v-else-if="!previewHtml" class="post-editor__preview-empty">{{ t('editor.previewEmpty') }}</p>
        <article v-else class="post-editor__preview-body article-body" v-html="previewHtml" />
        </section>
      </div>
    </div>
  </form>
</template>
