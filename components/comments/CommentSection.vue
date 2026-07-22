<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, watch } from 'vue'
import CommentForm from '~/components/comments/CommentForm.vue'
import CommentList from '~/components/comments/CommentList.vue'
import { useTblogI18n } from '~/composables/useTblogI18n'
import {
  submitComment,
  fetchPostComments,
  usePostComments,
  type SubmitCommentBody
} from '~/composables/usePublicApi'

const props = defineProps<{
  slug: string
  turnstileSiteKey?: string | null
}>()

const { data, pending, error, refresh } = usePostComments(() => props.slug, { limit: 20 })
const comments = shallowRef(data.value?.data ?? [])
const nextCursor = shallowRef(data.value?.meta.nextCursor ?? null)
const loadingMore = shallowRef(false)
const loadMoreError = shallowRef<string | null>(null)
const commentCount = computed(() => comments.value.reduce((total, comment) => total + 1 + (comment.replies?.length ?? 0), 0))
const submitting = shallowRef(false)
const formOpen = shallowRef(false)
const replyTarget = shallowRef<{ parentCommentId: string, nickname: string } | null>(null)
const composeTrigger = shallowRef<HTMLButtonElement | null>(null)
const composerPanel = shallowRef<HTMLElement | null>(null)
const feedback = shallowRef<string | null>(null)
const submitError = shallowRef<string | null>(null)
const formKey = shallowRef(0)
const { t } = useTblogI18n()

watch(() => props.slug, () => {
  formOpen.value = false
  replyTarget.value = null
  feedback.value = null
  submitError.value = null
  formKey.value += 1
  comments.value = []
  nextCursor.value = null
  loadMoreError.value = null
})

watch(data, (response) => {
  comments.value = response?.data ?? []
  nextCursor.value = response?.meta.nextCursor ?? null
  loadMoreError.value = null
}, { immediate: true })

async function loadMoreComments() {
  if (!nextCursor.value || loadingMore.value) return
  const slugAtStart = props.slug
  const cursorAtStart = nextCursor.value
  loadingMore.value = true
  loadMoreError.value = null
  try {
    const response = await fetchPostComments(slugAtStart, { cursor: cursorAtStart, limit: 20 })
    if (props.slug !== slugAtStart) return
    const known = new Set(comments.value.map((comment) => comment.id))
    comments.value = [
      ...comments.value,
      ...response.data.filter((comment) => !known.has(comment.id))
    ]
    nextCursor.value = response.meta.nextCursor
  } catch {
    loadMoreError.value = t('comments.loadMoreError')
  } finally {
    loadingMore.value = false
  }
}

async function handleSubmit(body: SubmitCommentBody) {
  if (submitting.value) return

  submitting.value = true
  feedback.value = null
  submitError.value = null

  try {
    const result = await submitComment(props.slug, replyTarget.value ? { ...body, parentCommentId: replyTarget.value.parentCommentId } : body)
    if (result.data.status === 'approved') {
      feedback.value = t('comments.autoApproved')
      await refresh()
    } else if (result.data.status === 'rejected') {
      feedback.value = t('comments.autoRejected')
    } else {
      feedback.value = t('comments.success')
    }
    formKey.value += 1
    formOpen.value = false
    replyTarget.value = null
    await nextTick()
    composeTrigger.value?.focus()
  } catch {
    submitError.value = t('comments.submitError')
  } finally {
    submitting.value = false
  }
}

async function openReply(parentCommentId: string, nickname: string) {
  replyTarget.value = { parentCommentId, nickname }
  formOpen.value = true
  await nextTick()
  composerPanel.value?.querySelector<HTMLElement>('input')?.focus()
}

async function toggleComposer() {
  formOpen.value = !formOpen.value
  if (!formOpen.value) replyTarget.value = null
  await nextTick()
  if (formOpen.value) composerPanel.value?.querySelector<HTMLElement>('input')?.focus()
  else composeTrigger.value?.focus()
}
</script>

<template>
  <section class="comment-section" aria-labelledby="comments-heading">
    <header class="comment-section__head">
      <div class="comment-section__heading">
        <p class="comment-section__eyebrow">{{ t('comments.eyebrow') }}</p>
        <h2 id="comments-heading" class="comment-section__title">{{ t('comments.title') }}</h2>
      </div>
      <div class="comment-section__head-actions">
        <span class="comment-section__count" :aria-label="t('comments.approvedCount', { count: commentCount })">
          {{ commentCount }}
        </span>
        <button
          ref="composeTrigger"
          class="comment-section__compose-trigger"
          type="button"
          aria-controls="comment-composer-panel"
          :aria-expanded="formOpen"
          @click="toggleComposer"
        >
          <span aria-hidden="true">{{ formOpen ? '×' : '+' }}</span>
          {{ formOpen ? t('comments.closeForm') : t('comments.writeComment') }}
        </button>
      </div>
    </header>

    <div class="comment-section__composer">
      <Transition name="comment-composer">
        <div v-if="formOpen" id="comment-composer-panel" ref="composerPanel" class="comment-section__composer-panel">
          <div v-if="replyTarget" class="comment-section__reply-context">
            <span>{{ t('comments.replyingTo', { nickname: replyTarget.nickname }) }}</span>
            <button type="button" @click="replyTarget = null">{{ t('common.cancel') }}</button>
          </div>
          <CommentForm
            :key="formKey"
            :submitting="submitting"
            :turnstile-site-key="props.turnstileSiteKey"
            @submit="handleSubmit"
          />
        </div>
      </Transition>
    </div>

    <p v-if="feedback" class="comment-section__feedback" role="status">{{ feedback }}</p>
    <p v-if="submitError" class="comment-section__error" role="alert">{{ submitError }}</p>

    <div class="comment-section__conversation">
      <p v-if="pending" class="comment-section__state" role="status">{{ t('comments.loading') }}</p>
      <p v-else-if="error" class="comment-section__error" role="alert">
        {{ t('comments.loadError') }}
      </p>
      <CommentList v-else :comments="comments" @reply="openReply" />
      <div v-if="!pending && !error && nextCursor" class="comment-section__pagination">
        <button type="button" :disabled="loadingMore" @click="loadMoreComments">
          {{ loadingMore ? t('comments.loadingMore') : t('comments.loadMore') }}
        </button>
      </div>
      <p v-if="loadMoreError" class="comment-section__error" role="alert">{{ loadMoreError }}</p>
    </div>
  </section>
</template>

<style scoped>
.comment-section {
  width: 100%;
  padding-top: 34px;
  border-top: 1px solid var(--color-line);
}

.comment-section__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 26px;
}

.comment-section__heading { min-width: 0; }

.comment-section__eyebrow {
  margin: 0 0 5px;
  color: var(--color-accent-warm);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.comment-section__title {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: clamp(2rem, 4vw, 2.6rem);
  font-weight: 650;
  letter-spacing: -0.025em;
  line-height: 1.25;
}

.comment-section__count {
  display: grid;
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  border: 1px solid var(--color-line);
  border-radius: 50%;
  background: rgba(var(--color-panel-rgb), 0.52);
  color: var(--color-accent);
  font-family: var(--font-display);
  font-size: 1.08rem;
  place-items: center;
}

.comment-section__head-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.comment-section__composer {
  margin-bottom: 20px;
}

.comment-section__compose-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 3px 9px;
  border: 1px solid rgba(var(--color-accent-warm-rgb), 0.3);
  border-radius: 999px;
  background: rgba(var(--color-accent-warm-rgb), 0.07);
  color: var(--color-text);
  font-size: .7rem;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.comment-section__compose-trigger span {
  color: var(--color-accent-warm);
  font-size: .86rem;
  font-weight: 500;
  line-height: 1;
}

.comment-section__compose-trigger:hover,
.comment-section__compose-trigger:focus-visible {
  border-color: rgba(var(--color-accent-warm-rgb), 0.48);
  background: rgba(var(--color-panel-rgb), 0.72);
  color: var(--color-accent-warm);
  outline: none;
}

.comment-section__composer-panel {
  transform-origin: top center;
}

.comment-section__reply-context { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 10px; padding: 8px 12px; border-radius: 10px; background: rgba(var(--color-accent-warm-rgb), .07); color: var(--color-muted); font-size: .78rem; }
.comment-section__reply-context button { padding: 0; border: 0; background: transparent; color: var(--color-accent-warm); font-weight: 700; cursor: pointer; }

.comment-composer-enter-active,
.comment-composer-leave-active {
  transition: opacity 0.2s ease, transform 0.22s ease;
}

.comment-composer-enter-from,
.comment-composer-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.99);
}

.comment-section__feedback,
.comment-section__error,
.comment-section__state {
  margin: 12px 0 0;
  font-size: 0.86rem;
}

.comment-section__feedback {
  color: var(--color-accent);
}

.comment-section__error {
  color: var(--color-accent-warm);
}

.comment-section__conversation {
  margin-top: 18px;
}

.comment-section__state {
  color: var(--color-muted);
}

.comment-section__pagination {
  display: flex;
  justify-content: center;
  margin-top: 22px;
}

.comment-section__pagination button {
  min-height: 38px;
  padding: 8px 18px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: rgba(var(--color-panel-rgb), 0.6);
  color: var(--color-text);
  cursor: pointer;
}

.comment-section__pagination button:disabled {
  cursor: wait;
  opacity: 0.65;
}

@media (max-width: 640px) {
  .comment-section {
    padding-top: 22px;
  }

  .comment-section__head {
    align-items: stretch;
    flex-direction: column;
    gap: 18px;
  }

  .comment-section__head-actions {
    align-items: flex-start;
  }

  .comment-section__compose-trigger {
    justify-content: center;
  }
}

</style>
