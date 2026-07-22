<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import CategoryManager from '~/components/admin/CategoryManager.vue'
import TagManager from '~/components/admin/TagManager.vue'
import {
  apiErrorMessage,
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  mergeTags,
  updateCategory,
  updateTag,
  useAdminCategories,
  useAdminTags,
  type AdminCategoryView,
  type AdminTagView,
  type CreateCategoryBody,
  type CreateTagBody,
  type UpdateCategoryBody,
  type UpdateTagBody
} from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

definePageMeta({ layout: 'admin', middleware: 'admin' })

const categoriesRequest = useAdminCategories()
const tagsRequest = useAdminTags()
const [
  {
    data: categoryData,
    error: categoryReadError,
    refresh: refreshCategories
  },
  {
    data: tagData,
    error: tagReadError,
    refresh: refreshTags
  }
] = await Promise.all([categoriesRequest, tagsRequest])

const categories = computed<AdminCategoryView[]>(() => categoryData.value?.data ?? [])
const tags = computed<AdminTagView[]>(() => tagData.value?.data ?? [])
const { t } = useTblogI18n()

const savingCategory = shallowRef(false)
const savingTag = shallowRef(false)
const categoryError = shallowRef('')
const tagError = shallowRef('')
const categoryErrorMessage = computed(() => categoryError.value || (
  categoryReadError.value
    ? apiErrorMessage(categoryReadError.value, t('admin.loadCategoriesError'))
    : ''
))
const tagErrorMessage = computed(() => tagError.value || (
  tagReadError.value
    ? apiErrorMessage(tagReadError.value, t('admin.loadTagsError'))
    : ''
))

function sortTaxonomyItems<T extends { sortOrder: number; name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
}

async function runCategory(action: () => Promise<unknown>) {
  if (savingCategory.value) {
    return
  }
  savingCategory.value = true
  categoryError.value = ''
  try {
    await action()
  } catch (error) {
    categoryError.value = apiErrorMessage(error, t('admin.saveCategoryError'))
  } finally {
    savingCategory.value = false
  }
}

async function runTag(action: () => Promise<unknown>) {
  if (savingTag.value) {
    return
  }
  savingTag.value = true
  tagError.value = ''
  try {
    await action()
  } catch (error) {
    tagError.value = apiErrorMessage(error, t('admin.saveTagError'))
  } finally {
    savingTag.value = false
  }
}

async function updateTagsLocally(update: (items: AdminTagView[]) => AdminTagView[]) {
  if (!tagData.value) {
    await refreshTags()
    return
  }
  tagData.value = {
    ...tagData.value,
    data: update(tagData.value.data)
  }
}

function onCategoryCreate(payload: CreateCategoryBody) {
  void runCategory(async () => {
    const response = await createCategory(payload)
    if (categoryData.value) {
      categoryData.value = { ...categoryData.value, data: sortTaxonomyItems([...categoryData.value.data, response.data]) }
    } else await refreshCategories()
  })
}
function onCategoryUpdate(id: string, payload: UpdateCategoryBody) {
  void runCategory(async () => {
    const response = await updateCategory(id, payload)
    if (categoryData.value) {
      categoryData.value = {
        ...categoryData.value,
        data: sortTaxonomyItems(categoryData.value.data.map((item) => item.id === id ? response.data : item))
      }
    } else await refreshCategories()
  })
}
function onCategoryRemove(id: string) {
  void runCategory(async () => {
    const removed = categoryData.value?.data.find((item) => item.id === id)
    await deleteCategory(id)
    if (categoryData.value) {
      categoryData.value = {
        ...categoryData.value,
        data: categoryData.value.data
          .filter((item) => item.id !== id)
          .map((item) => item.isSystem && removed ? { ...item, articleCount: item.articleCount + removed.articleCount } : item)
      }
    } else await refreshCategories()
  })
}

function onTagCreate(payload: CreateTagBody) {
  void runTag(async () => {
    const response = await createTag(payload)
    await updateTagsLocally((items) => sortTaxonomyItems([...items, response.data]))
  })
}
function onTagUpdate(id: string, payload: UpdateTagBody) {
  void runTag(async () => {
    const response = await updateTag(id, payload)
    await updateTagsLocally((items) => sortTaxonomyItems(items.map((item) => item.id === id ? response.data : item)))
  })
}
function onTagRemove(id: string) {
  void runTag(async () => {
    await deleteTag(id)
    await updateTagsLocally((items) => items.filter((item) => item.id !== id))
  })
}
function onTagMerge(sourceId: string, targetId: string) {
  void runTag(async () => {
    await mergeTags(sourceId, targetId)
    await updateTagsLocally((items) => items.filter((item) => item.id !== sourceId))
    try {
      await refreshTags()
    } catch {
      tagError.value = t('admin.taxonomySyncWarning')
    }
  })
}
</script>

<template>
  <section class="admin-taxonomy">
    <div class="admin-page-header">
      <div>
        <h1 class="admin-page-header__title">{{ t('admin.taxonomy') }}</h1>
        <p class="admin-page-header__meta">{{ t('admin.taxonomyMeta') }}</p>
      </div>
    </div>

    <CategoryManager
      :categories="categories"
      :saving="savingCategory"
      :error="categoryErrorMessage"
      @create="onCategoryCreate"
      @update="onCategoryUpdate"
      @remove="onCategoryRemove"
    />

    <TagManager
      :tags="tags"
      :saving="savingTag"
      :error="tagErrorMessage"
      @create="onTagCreate"
      @update="onTagUpdate"
      @remove="onTagRemove"
      @merge="onTagMerge"
    />
  </section>
</template>
