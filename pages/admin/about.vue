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
  fetchAdminPost,
  previewMarkdown as renderAdminPreview,
  updatePost,
  type AdminPostEditView,
  type AdminPostStatus,
  type UpdatePostBody
} from '~/composables/useAdminApi'
import type { Envelope } from '~/composables/usePublicApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const saving = shallowRef(false)
const errorMessage = shallowRef('')
const { t } = useTblogI18n()
const taxonomyOptions: TaxonomyOption[] = []

interface AboutPostLoadResult {
  post: AdminPostEditView | null
}

const { data, error } = await useAsyncData<AboutPostLoadResult>('admin-about-post', async () => {
  const requestFetch = useRequestFetch()
  // Resolve the About page directly by slug instead of listing every post and filtering client-side.
  const response = await requestFetch<Envelope<AdminPostEditView | null>>('/api/v1/admin/posts/by-slug/about')
  return { post: response.data ?? null }
})

const aboutPost = computed(() => data.value?.post ?? null)
const initialPost = computed<PostEditorInitialPost>(() => {
  const post = aboutPost.value
  if (!post) {
    return {
      title: 'About',
      type: 'page',
      status: 'draft',
      featured: false,
      slug: 'about',
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
    }
  }

  return {
    title: post.title,
    type: post.type,
    status: post.status,
    featured: false,
    slug: post.slug,
    cover: null,
    customExcerpt: post.customExcerpt,
    categoryId: null,
    tagIds: [],
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
    slug: 'about',
    customExcerpt: payload.customExcerpt,
    markdown: payload.markdown,
    status
  }
}

async function persist(payload: PostEditorSavePayload, status: AdminPostStatus = payload.status) {
  saving.value = true
  errorMessage.value = ''
  try {
    if (aboutPost.value) {
      const response = await updatePost(aboutPost.value.id, toUpdateBody(payload, status))
      data.value = { post: response.data }
      return
    }

    const created = await createPost({
      type: 'page',
      title: payload.title || 'About',
      slug: 'about',
      customExcerpt: payload.customExcerpt,
      markdown: payload.markdown
    })
    if (status === 'published') {
      const response = await updatePost(created.data.id, { status: 'published' })
      data.value = { post: response.data }
    } else {
      const response = await fetchAdminPost(created.data.id)
      data.value = { post: response.data }
    }
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, t('admin.saveAboutError'))
  } finally {
    saving.value = false
  }
}

function handleSave(payload: PostEditorSavePayload) {
  void persist(payload)
}

function handleStatusChange(status: AdminPostStatus, payload: PostEditorSavePayload) {
  void persist(payload, status)
}
</script>

<template>
  <section class="admin-posts">
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-header__title">{{ t('admin.about') }}</h1>
        <p class="admin-page-header__meta">{{ t('admin.aboutMeta') }}</p>
      </div>
    </div>

    <p v-if="error || errorMessage" class="admin-alert" role="alert">
      {{ errorMessage || t('admin.aboutUnavailable') }}
    </p>
    <p
      v-if="aboutPost?.processingState === 'failed'"
      class="admin-alert"
      role="alert"
      data-test="content-processing-warning"
    >
      {{ t('admin.contentProcessingWarning', { message: aboutPost.processingError || t('admin.contentProcessingUnknown') }) }}
    </p>
    <PostEditor
      v-else
      :key="aboutPost?.id ?? 'new-about'"
      :initial-post="initialPost"
      :categories="taxonomyOptions"
      :tags="taxonomyOptions"
      :preview-markdown="previewMarkdown"
      :saving="saving"
      @save="handleSave"
      @status-change="handleStatusChange"
    />
  </section>
</template>
