<script lang="ts">
import type { AdminTagView, CreateTagBody, UpdateTagBody } from '~/composables/useAdminApi'
</script>

<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  tags: AdminTagView[]
  saving?: boolean
  error?: string
}

const props = withDefaults(defineProps<Props>(), { saving: false, error: '' })
const emit = defineEmits<{
  create: [payload: CreateTagBody]
  update: [id: string, payload: UpdateTagBody]
  remove: [id: string]
  merge: [sourceId: string, targetId: string]
}>()
const { t } = useTblogI18n()

const editingId = shallowRef<string | null>(null)
const submitted = shallowRef(false)
const mergeSubmitted = shallowRef(false)
const form = reactive({ name: '', slug: '', sortOrder: 0 })
const mergeForm = reactive({ sourceId: '', targetId: '' })

const canMerge = computed(
  () => mergeForm.sourceId !== '' && mergeForm.targetId !== '' && mergeForm.sourceId !== mergeForm.targetId
)

function resetForm() {
  editingId.value = null
  form.name = ''
  form.slug = ''
  form.sortOrder = 0
}

function startEdit(tag: AdminTagView) {
  editingId.value = tag.id
  form.name = tag.name
  form.slug = tag.slug
  form.sortOrder = tag.sortOrder
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

function submitMerge() {
  if (!canMerge.value) {
    return
  }
  emit('merge', mergeForm.sourceId, mergeForm.targetId)
  mergeSubmitted.value = true
}

watch(() => props.tags, () => {
  if (submitted.value && !props.error) {
    submitted.value = false
    resetForm()
  }
  if (mergeSubmitted.value && !props.error) {
    mergeSubmitted.value = false
    mergeForm.sourceId = ''
    mergeForm.targetId = ''
  }
})
</script>

<template>
  <section class="taxonomy-manager" :aria-label="t('admin.tags')">
    <h2 class="taxonomy-manager__title">{{ t('admin.tags') }}</h2>
    <p v-if="error" class="admin-alert" role="alert">{{ error }}</p>

    <form class="taxonomy-form" @submit.prevent="submit">
      <input v-model="form.name" data-test="tag-name" class="taxonomy-form__input" :placeholder="t('taxonomy.namePlaceholder')" required>
      <input v-model="form.slug" data-test="tag-slug" class="taxonomy-form__input" :placeholder="t('taxonomy.slugPlaceholder')">
      <input v-model.number="form.sortOrder" data-test="tag-sort" class="taxonomy-form__input" type="number">
      <button type="submit" data-test="tag-submit" class="taxonomy-form__submit" :disabled="saving">
        {{ editingId ? t('common.save') : t('taxonomy.add') }}
      </button>
      <button v-if="editingId" type="button" data-test="tag-cancel" class="taxonomy-form__cancel" @click="resetForm">
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
          <tr v-for="tag in tags" :key="tag.id" :data-test="`tag-row-${tag.id}`">
            <td>{{ tag.name }}</td>
            <td>{{ tag.slug }}</td>
            <td>{{ tag.articleCount }}</td>
            <td>{{ tag.sortOrder }}</td>
            <td class="taxonomy-table__actions">
              <button
                type="button"
                :data-test="`tag-edit-${tag.id}`"
                class="taxonomy-table__edit"
                @click="startEdit(tag)"
              >
                {{ t('common.edit') }}
              </button>
              <button
                type="button"
                :data-test="`tag-delete-${tag.id}`"
                class="taxonomy-table__delete"
                :disabled="saving"
                @click="emit('remove', tag.id)"
              >
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <form class="taxonomy-merge" @submit.prevent="submitMerge">
      <h3 class="taxonomy-merge__title">{{ t('taxonomy.mergeTags') }}</h3>
      <select v-model="mergeForm.sourceId" data-test="merge-source" class="taxonomy-merge__select">
        <option value="">{{ t('taxonomy.source') }}</option>
        <option v-for="tag in tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option>
      </select>
      <span class="taxonomy-merge__arrow" aria-hidden="true">→</span>
      <select v-model="mergeForm.targetId" data-test="merge-target" class="taxonomy-merge__select">
        <option value="">{{ t('taxonomy.target') }}</option>
        <option v-for="tag in tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option>
      </select>
      <button type="submit" data-test="merge-submit" class="taxonomy-merge__submit" :disabled="!canMerge || saving">
        {{ t('taxonomy.merge') }}
      </button>
    </form>
  </section>
</template>
