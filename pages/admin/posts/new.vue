<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import PostEditor, {
  type PostEditorInitialPost,
  type PostEditorSavePayload
} from '~/components/admin/PostEditor.vue'
import type { TaxonomyOption } from '~/components/admin/PostMetadataPanel.vue'
import {
  apiErrorMessage,
  createPost,
  previewMarkdown as renderAdminPreview,
  updatePost,
  type AdminPostStatus,
  useAdminTaxonomyOptions,
  useAdminIntegrations,
  uploadMedia
} from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const saving = shallowRef(false)
const { t } = useTblogI18n()
const errorMessage = shallowRef('')
const taxonomyRequest = useAdminTaxonomyOptions()
const integrationsRequest = useAdminIntegrations()
const [
  { data: taxonomyData },
  { data: integrationData }
] = await Promise.all([taxonomyRequest, integrationsRequest])
const categoryOptions = computed<TaxonomyOption[]>(() => taxonomyData.value?.data.categories ?? [])
const tagOptions = computed<TaxonomyOption[]>(() => taxonomyData.value?.data.tags ?? [])
const mediaUploadEnabled = computed(() => integrationData.value?.data.some((item) =>
  item.capability === 'storage' && item.providerKey === 'cloudflare-r2' && item.enabled &&
  item.missingBindings.length === 0 && typeof item.config.publicBaseUrl === 'string'
) ?? false)

async function uploadEditorMedia(file: File, altText?: string) {
  const response = await uploadMedia(file, altText)
  return response.data
}

const initialPost = computed<PostEditorInitialPost>(() => ({
  title: '',
  type: 'article',
  status: 'draft',
  featured: false,
  slug: '',
  cover: null,
  customExcerpt: null,
  categoryId: null,
  tagIds: [],
  markdown: '',
  seoTitle: null,
  seoDescription: null,
  canonicalUrlOverride: null,
  openGraphImageUrl: null,
  twitterImageUrl: null,
  jsonLdOverrideJson: null
}))

async function previewMarkdown(markdown: string) {
  const response = await renderAdminPreview(markdown)
  return response.data
}

async function createFromPayload(payload: PostEditorSavePayload, status: AdminPostStatus = payload.status) {
  saving.value = true
  errorMessage.value = ''
  try {
    const created = await createPost({
      type: payload.type,
      title: payload.title,
      slug: payload.slug || undefined,
      categoryId: payload.categoryId,
      cover: payload.cover,
      customExcerpt: payload.customExcerpt,
      tagIds: payload.tagIds,
      markdown: payload.markdown,
      seoTitle: payload.seoTitle,
      seoDescription: payload.seoDescription,
      canonicalUrlOverride: payload.canonicalUrlOverride,
      openGraphImageUrl: payload.openGraphImageUrl,
      twitterImageUrl: payload.twitterImageUrl,
      jsonLdOverrideJson: payload.jsonLdOverrideJson
    })
    if (status === 'published') {
      await updatePost(created.data.id, { status: 'published', featured: payload.featured })
    }
    await navigateTo(`/admin/posts/${created.data.id}`)
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, t('admin.createPostError'))
  } finally {
    saving.value = false
  }
}

function handleSave(payload: PostEditorSavePayload) {
  void createFromPayload(payload)
}

function handleStatusChange(status: AdminPostStatus, payload: PostEditorSavePayload) {
  void createFromPayload(payload, status)
}
</script>

<template>
  <section class="admin-posts">
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-header__title">{{ t('admin.newPost') }}</h1>
        <p class="admin-page-header__meta">{{ t('admin.newPostMeta') }}</p>
      </div>
      <NuxtLink class="admin-page-header__action admin-page-header__action--secondary" to="/admin/posts">
        {{ t('common.back') }}
      </NuxtLink>
    </div>

    <p v-if="errorMessage" class="admin-alert" role="alert">{{ errorMessage }}</p>
    <PostEditor
      :initial-post="initialPost"
      :categories="categoryOptions"
      :tags="tagOptions"
      :preview-markdown="previewMarkdown"
      :saving="saving"
      :media-upload-enabled="mediaUploadEnabled"
      :upload-media="uploadEditorMedia"
      @save="handleSave"
      @status-change="handleStatusChange"
    />
  </section>
</template>
