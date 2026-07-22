<script lang="ts">
import type { AdminPostStatus, AdminPostType } from '~/composables/useAdminApi'

export interface TaxonomyOption {
  id: string
  name: string
}

export interface PostMetadataModel {
  type: AdminPostType
  slug: string
  cover: string | null
  categoryId: string | null
  tagIds: string[]
  status: AdminPostStatus
  featured: boolean
  seoTitle: string | null
  seoDescription: string | null
  canonicalUrlOverride: string | null
  openGraphImageUrl: string | null
  twitterImageUrl: string | null
  jsonLdOverrideJson: string | null
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  modelValue: PostMetadataModel
  categories: TaxonomyOption[]
  tags: TaxonomyOption[]
  uploadEnabled?: boolean
  uploading?: boolean
}

const props = withDefaults(defineProps<Props>(), { uploadEnabled: false, uploading: false })
const emit = defineEmits<{
  'update:modelValue': [value: PostMetadataModel]
  uploadCover: []
}>()
const { t } = useTblogI18n()

const showArticleFields = computed(() => props.modelValue.type === 'article')

function update(patch: Partial<PostMetadataModel>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

function updateCategory(value: string) {
  update({ categoryId: value || null })
}

function updateCover(value: string) {
  update({ cover: value.trim() || null })
}

function updateOptionalText(
  field: keyof Pick<PostMetadataModel,
    'seoTitle' | 'seoDescription' | 'canonicalUrlOverride' | 'openGraphImageUrl' |
    'twitterImageUrl' | 'jsonLdOverrideJson'>,
  value: string
) {
  update({ [field]: value === '' ? null : value })
}

function updateTag(tagId: string, checked: boolean) {
  const current = new Set(props.modelValue.tagIds)
  if (checked) {
    current.add(tagId)
  } else {
    current.delete(tagId)
  }
  update({ tagIds: Array.from(current) })
}
</script>

<template>
  <aside class="post-metadata" :aria-label="t('editor.metadata')">
    <label class="post-metadata__field">
      <span class="post-metadata__label">{{ t('editor.slug') }}</span>
      <input
        data-test="metadata-slug"
        class="post-metadata__control"
        :value="modelValue.slug"
        @input="update({ slug: ($event.target as HTMLInputElement).value })"
      >
    </label>

    <label class="post-metadata__field">
      <span class="post-metadata__label">{{ t('editor.status') }}</span>
      <select
        data-test="metadata-status"
        class="post-metadata__control"
        :value="modelValue.status"
        @change="update({ status: ($event.target as HTMLSelectElement).value as PostMetadataModel['status'] })"
      >
        <option value="draft">{{ t('editor.draft') }}</option>
        <option value="published">{{ t('editor.published') }}</option>
      </select>
    </label>

    <template v-if="showArticleFields">
      <div class="post-metadata__feature-field">
        <label class="post-metadata__check post-metadata__check--featured">
          <input
            type="checkbox"
            data-test="metadata-featured"
            :checked="modelValue.featured"
            :disabled="modelValue.status !== 'published'"
            @change="update({ featured: ($event.target as HTMLInputElement).checked })"
          >
          <span>{{ t('editor.featured') }}</span>
        </label>
        <p v-if="modelValue.status !== 'published'" class="post-metadata__hint">
          {{ t('editor.featuredPublishedOnly') }}
        </p>
      </div>

      <div class="post-metadata__cover-field">
        <label class="post-metadata__field">
          <span class="post-metadata__label">{{ t('editor.coverUrl') }}</span>
          <input
            data-test="metadata-cover"
            class="post-metadata__control"
            :value="modelValue.cover ?? ''"
            placeholder="https://example.com/cover.jpg"
            @input="updateCover(($event.target as HTMLInputElement).value)"
          >
        </label>

        <button
          v-if="props.uploadEnabled"
          type="button"
          class="post-metadata__upload"
          data-test="metadata-upload-cover"
          :disabled="props.uploading"
          @click="emit('uploadCover')"
        >
          {{ props.uploading ? t('editor.uploadingImage') : t('editor.uploadCover') }}
        </button>
      </div>

      <label class="post-metadata__field">
        <span class="post-metadata__label">{{ t('editor.category') }}</span>
        <select
          data-test="metadata-category"
          class="post-metadata__control"
          :value="modelValue.categoryId ?? ''"
          @change="updateCategory(($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ t('editor.none') }}</option>
          <option v-for="category in categories" :key="category.id" :value="category.id">
            {{ category.name }}
          </option>
        </select>
      </label>

      <fieldset class="post-metadata__field post-metadata__fieldset">
        <legend class="post-metadata__label">{{ t('editor.tags') }}</legend>
        <label v-for="tag in tags" :key="tag.id" class="post-metadata__check">
          <input
            type="checkbox"
            :data-test="`metadata-tag-${tag.id}`"
            :checked="modelValue.tagIds.includes(tag.id)"
            @change="updateTag(tag.id, ($event.target as HTMLInputElement).checked)"
          >
          <span>{{ tag.name }}</span>
        </label>
      </fieldset>

      <details class="post-metadata__seo" data-test="metadata-seo-panel">
        <summary>{{ t('editor.seoMetadata') }}</summary>
        <p class="post-metadata__seo-hint">{{ t('editor.seoMetadataHint') }}</p>
        <div class="post-metadata__seo-grid">
          <label class="post-metadata__field">
            <span class="post-metadata__label">{{ t('editor.seoTitle') }}</span>
            <input
              data-test="metadata-seo-title"
              class="post-metadata__control"
              :value="modelValue.seoTitle ?? ''"
              maxlength="200"
              @input="updateOptionalText('seoTitle', ($event.target as HTMLInputElement).value)"
            >
          </label>

          <label class="post-metadata__field post-metadata__seo-description">
            <span class="post-metadata__label">{{ t('editor.seoDescription') }}</span>
            <textarea
              data-test="metadata-seo-description"
              class="post-metadata__control"
              :value="modelValue.seoDescription ?? ''"
              maxlength="500"
              rows="3"
              @input="updateOptionalText('seoDescription', ($event.target as HTMLTextAreaElement).value)"
            />
          </label>

          <label class="post-metadata__field">
            <span class="post-metadata__label">{{ t('editor.canonicalOverride') }}</span>
            <input
              data-test="metadata-canonical-override"
              class="post-metadata__control"
              type="url"
              :value="modelValue.canonicalUrlOverride ?? ''"
              placeholder="https://example.com/posts/article"
              @input="updateOptionalText('canonicalUrlOverride', ($event.target as HTMLInputElement).value)"
            >
          </label>

          <label class="post-metadata__field">
            <span class="post-metadata__label">{{ t('editor.openGraphImage') }}</span>
            <input
              data-test="metadata-og-image"
              class="post-metadata__control"
              type="url"
              :value="modelValue.openGraphImageUrl ?? ''"
              placeholder="https://example.com/og.png"
              @input="updateOptionalText('openGraphImageUrl', ($event.target as HTMLInputElement).value)"
            >
          </label>

          <label class="post-metadata__field">
            <span class="post-metadata__label">{{ t('editor.twitterImage') }}</span>
            <input
              data-test="metadata-twitter-image"
              class="post-metadata__control"
              type="url"
              :value="modelValue.twitterImageUrl ?? ''"
              placeholder="https://example.com/twitter.png"
              @input="updateOptionalText('twitterImageUrl', ($event.target as HTMLInputElement).value)"
            >
          </label>

          <label class="post-metadata__field post-metadata__seo-json">
            <span class="post-metadata__label">{{ t('editor.jsonLdOverride') }}</span>
            <textarea
              data-test="metadata-json-ld"
              class="post-metadata__control post-metadata__control--code"
              :value="modelValue.jsonLdOverrideJson ?? ''"
              maxlength="50000"
              rows="6"
              spellcheck="false"
              placeholder='{"@context":"https://schema.org","@type":"Article"}'
              @input="updateOptionalText('jsonLdOverrideJson', ($event.target as HTMLTextAreaElement).value)"
            />
          </label>
        </div>
      </details>
    </template>
  </aside>
</template>
