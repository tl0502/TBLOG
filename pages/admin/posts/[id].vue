<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import PostEditor, {
  type PostEditorInitialPost,
  type PostEditorSavePayload
} from '~/components/admin/PostEditor.vue'
import type { TaxonomyOption } from '~/components/admin/PostMetadataPanel.vue'
import {
  apiErrorMessage,
  previewMarkdown as renderAdminPreview,
  updatePost,
  type AdminPostEditView,
  type AdminPostStatus,
  type UpdatePostBody,
  useAdminTaxonomyOptions,
  useAdminIntegrations,
  uploadMedia
} from '~/composables/useAdminApi'
import type { Envelope } from '~/composables/usePublicApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const route = useRoute()
const requestFetch = useRequestFetch()
const id = computed(() => String(route.params.id))
const saving = shallowRef(false)
const errorMessage = shallowRef('')
const { t } = useTblogI18n()
const taxonomyRequest = useAdminTaxonomyOptions()
const integrationsRequest = useAdminIntegrations()
const postRequest = useAsyncData(`admin-post-${id.value}`, async () => {
  const response = await requestFetch<Envelope<AdminPostEditView>>(`/api/v1/admin/posts/${id.value}`)
  return response.data
})
const [
  { data: taxonomyData },
  { data: integrationData, refresh: refreshIntegrations },
  { data, error }
] = await Promise.all([taxonomyRequest, integrationsRequest, postRequest])
const categoryOptions = computed<TaxonomyOption[]>(() => taxonomyData.value?.data.categories ?? [])
const tagOptions = computed<TaxonomyOption[]>(() => taxonomyData.value?.data.tags ?? [])
const mediaUploadEnabled = computed(() => integrationData.value?.data.some((item) =>
  item.capability === 'storage' && item.providerKey === 'cloudflare-r2' && item.enabled &&
  item.missingBindings.length === 0 && typeof item.config.publicBaseUrl === 'string'
) ?? false)
const searchSyncError = computed(() => integrationData.value?.data.find((item) =>
  item.capability === 'search' && item.providerKey === 'algolia'
)?.lastError ?? '')

async function uploadEditorMedia(file: File, altText?: string) {
  const response = await uploadMedia(file, altText)
  return response.data
}

const initialPost = computed<PostEditorInitialPost | null>(() => {
  const post = data.value
  if (!post) {
    return null
  }
  return {
    title: post.title,
    type: post.type,
    status: post.status,
    featured: post.featured,
    slug: post.slug,
    cover: post.cover,
    customExcerpt: post.customExcerpt,
    categoryId: post.categoryId,
    tagIds: post.tagIds,
    markdown: post.markdown,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    canonicalUrlOverride: post.canonicalUrlOverride,
    openGraphImageUrl: post.openGraphImageUrl,
    twitterImageUrl: post.twitterImageUrl,
    jsonLdOverrideJson: post.jsonLdOverrideJson
  }
})
async function previewMarkdown(markdown: string) {
  const response = await renderAdminPreview(markdown)
  return response.data
}

function toUpdateBody(payload: PostEditorSavePayload, status: AdminPostStatus = payload.status): UpdatePostBody {
  return {
    title: payload.title,
    slug: payload.slug,
    categoryId: payload.categoryId,
    cover: payload.cover,
    customExcerpt: payload.customExcerpt,
    tagIds: payload.tagIds,
    markdown: payload.markdown,
    status,
    featured: payload.featured,
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    canonicalUrlOverride: payload.canonicalUrlOverride,
    openGraphImageUrl: payload.openGraphImageUrl,
    twitterImageUrl: payload.twitterImageUrl,
    jsonLdOverrideJson: payload.jsonLdOverrideJson
  }
}

async function savePayload(payload: PostEditorSavePayload, status: AdminPostStatus = payload.status) {
  saving.value = true
  errorMessage.value = ''
  try {
    const shouldRefreshIntegrations = data.value?.status === 'published' || status === 'published'
    const response = await updatePost(id.value, toUpdateBody(payload, status))
    data.value = response.data
    if (shouldRefreshIntegrations) {
      await refreshIntegrations()
    }
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, t('admin.savePostError'))
  } finally {
    saving.value = false
  }
}

function handleSave(payload: PostEditorSavePayload) {
  void savePayload(payload)
}

function handleStatusChange(status: AdminPostStatus, payload: PostEditorSavePayload) {
  void savePayload(payload, status)
}
</script>

<template>
  <section class="admin-posts">
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-header__title">{{ t('admin.editPost') }}</h1>
        <p class="admin-page-header__meta">{{ initialPost?.slug ?? t('common.loading') }}</p>
      </div>
      <NuxtLink class="admin-page-header__action admin-page-header__action--secondary" to="/admin/posts">
        {{ t('common.back') }}
      </NuxtLink>
    </div>

    <p v-if="error || errorMessage" class="admin-alert" role="alert">
      {{ errorMessage || t('admin.postUnavailable') }}
    </p>
    <p
      v-if="data?.processingState === 'failed'"
      class="admin-alert"
      role="alert"
      data-test="content-processing-warning"
    >
      {{ t('admin.contentProcessingWarning', { message: data.processingError || t('admin.contentProcessingUnknown') }) }}
    </p>
    <p v-if="searchSyncError" class="admin-alert" role="alert" data-test="search-sync-warning">
      {{ t('admin.searchSyncWarning', { message: searchSyncError }) }}
    </p>
    <PostEditor
      v-if="initialPost"
      :key="data?.id"
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
    <p v-else class="admin-muted">{{ t('admin.loadingPost') }}</p>
  </section>
</template>
