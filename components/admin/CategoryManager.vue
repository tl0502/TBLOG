<script lang="ts">
import type {
  AdminCategoryView,
  CreateCategoryBody,
  UpdateCategoryBody
} from '~/composables/useAdminApi'
</script>

<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  categories: AdminCategoryView[]
  saving?: boolean
  error?: string
}

const props = withDefaults(defineProps<Props>(), { saving: false, error: '' })
const emit = defineEmits<{
  create: [payload: CreateCategoryBody]
  update: [id: string, payload: UpdateCategoryBody]
  remove: [id: string]
}>()
const { t } = useTblogI18n()

const editingId = shallowRef<string | null>(null)
const submitted = shallowRef(false)
const form = reactive({ name: '', slug: '', sortOrder: 0 })

function resetForm() {
  editingId.value = null
  form.name = ''
  form.slug = ''
  form.sortOrder = 0
}

function startEdit(category: AdminCategoryView) {
  editingId.value = category.id
  form.name = category.name
  form.slug = category.slug
  form.sortOrder = category.sortOrder
}

function submit() {
  const slug = form.slug.trim()
  const payload = { name: form.name.trim(), slug: slug || undefined, sortOrder: form.sortOrder }
  if (editingId.value) {
    emit('update', editingId.value, payload)
  } else {
    emit('create', payload)
  }
  submitted.value = true
}

watch(() => props.categories, () => {
  if (submitted.value && !props.error) {
    submitted.value = false
    resetForm()
  }
})
</script>

<template>
  <section class="taxonomy-manager" :aria-label="t('admin.categories')">
    <h2 class="taxonomy-manager__title">{{ t('admin.categories') }}</h2>
    <p v-if="error" class="admin-alert" role="alert">{{ error }}</p>

    <form class="taxonomy-form" @submit.prevent="submit">
      <input v-model="form.name" data-test="category-name" class="taxonomy-form__input" :placeholder="t('taxonomy.namePlaceholder')" required>
      <input v-model="form.slug" data-test="category-slug" class="taxonomy-form__input" :placeholder="t('taxonomy.slugPlaceholder')">
      <input v-model.number="form.sortOrder" data-test="category-sort" class="taxonomy-form__input" type="number">
      <button type="submit" data-test="category-submit" class="taxonomy-form__submit" :disabled="saving">
        {{ editingId ? t('common.save') : t('taxonomy.add') }}
      </button>
      <button v-if="editingId" type="button" data-test="category-cancel" class="taxonomy-form__cancel" @click="resetForm">
        {{ t('common.cancel') }}
      </button>
    </form>

    <div class="taxonomy-table-scroll">
      <table class="taxonomy-table">
        <thead>
          <tr>
            <th>{{ t('table.name') }}</th><th>{{ t('table.slug') }}</th><th>{{ t('table.articles') }}</th><th>{{ t('table.order') }}</th><th>{{ t('table.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="category in categories" :key="category.id" :data-test="`category-row-${category.id}`">
            <td>{{ category.name }}</td>
            <td>{{ category.slug }}</td>
            <td>{{ category.articleCount }}</td>
            <td>{{ category.sortOrder }}</td>
            <td class="taxonomy-table__actions">
              <button
                type="button"
                :data-test="`category-edit-${category.id}`"
                class="taxonomy-table__edit"
                @click="startEdit(category)"
              >
                {{ t('common.edit') }}
              </button>
              <button
                type="button"
                :data-test="`category-delete-${category.id}`"
                class="taxonomy-table__delete"
                :disabled="category.isSystem || saving"
                :title="category.isSystem ? t('taxonomy.systemDelete') : t('taxonomy.deleteCategory')"
                @click="emit('remove', category.id)"
              >
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
