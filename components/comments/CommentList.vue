<script setup lang="ts">
import type { PublicCommentView } from '~/types/public-view'
import { reactive } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'

defineProps<{
  comments: PublicCommentView[]
}>()
const emit = defineEmits<{ reply: [parentCommentId: string, nickname: string] }>()
const { formatDate, t } = useTblogI18n()
const expandedReplies = reactive(new Set<string>())

function visibleReplies(comment: PublicCommentView) {
  const replies = comment.replies ?? []
  return expandedReplies.has(comment.id) ? replies : replies.slice(0, 3)
}

function toggleReplies(commentId: string) {
  if (expandedReplies.has(commentId)) expandedReplies.delete(commentId)
  else expandedReplies.add(commentId)
}

function commentInitial(nickname: string): string {
  return nickname.trim().charAt(0).toUpperCase() || '?'
}
</script>

<template>
  <div class="comment-list">
    <p v-if="comments.length === 0" class="comment-list__empty">
      {{ t('comments.empty') }}
    </p>

    <ol v-else class="comment-list__items">
      <li v-for="comment in comments" :key="comment.id" class="comment-list__item">
        <span class="comment-list__avatar" aria-hidden="true">{{ commentInitial(comment.nickname) }}</span>
        <div class="comment-list__body">
          <div class="comment-list__meta">
            <strong class="comment-list__nickname">{{ comment.nickname }}</strong>
            <time class="comment-list__date" :datetime="comment.createdAt">
              {{ formatDate(comment.createdAt) }}
            </time>
          </div>
          <p class="comment-list__content">{{ comment.content }}</p>
          <button class="comment-list__reply" type="button" @click="emit('reply', comment.id, comment.nickname)">{{ t('comments.reply') }}</button>
          <ol v-if="comment.replies?.length" class="comment-list__replies">
            <li v-for="reply in visibleReplies(comment)" :key="reply.id" class="comment-list__reply-item">
              <span class="comment-list__avatar comment-list__avatar--reply" aria-hidden="true">{{ commentInitial(reply.nickname) }}</span>
              <div class="comment-list__body">
                <div class="comment-list__meta">
                  <strong class="comment-list__nickname">{{ reply.nickname }}</strong>
                  <span v-if="reply.replyToNickname" class="comment-list__reply-target">{{ t('comments.replyTarget', { nickname: reply.replyToNickname }) }}</span>
                  <time class="comment-list__date" :datetime="reply.createdAt">{{ formatDate(reply.createdAt) }}</time>
                </div>
                <p class="comment-list__content">{{ reply.content }}</p>
                <button class="comment-list__reply" type="button" @click="emit('reply', reply.id, reply.nickname)">{{ t('comments.reply') }}</button>
              </div>
            </li>
            <li v-if="comment.replies.length > 3" class="comment-list__replies-toggle-item">
              <button class="comment-list__replies-toggle" type="button" :aria-expanded="expandedReplies.has(comment.id)" @click="toggleReplies(comment.id)">
                {{ expandedReplies.has(comment.id) ? t('comments.collapseReplies') : t('comments.expandReplies', { count: comment.replies.length - 3 }) }}
              </button>
            </li>
          </ol>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.comment-list__empty {
  margin: 0;
  padding: 28px 20px;
  border-radius: 16px;
  background: rgba(var(--color-panel-rgb), 0.28);
  color: var(--color-muted);
  font-size: 0.9rem;
  text-align: center;
}

.comment-list__items {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.comment-list__item {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 16px;
  padding: 22px 16px;
  border-top: 1px solid var(--color-line);
  border-radius: 14px;
  transition: background 0.16s ease;
}

.comment-list__item:hover {
  background: rgba(var(--color-panel-rgb), 0.28);
}

.comment-list__avatar {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(var(--color-accent-rgb), 0.15);
  border-radius: 50%;
  background: linear-gradient(145deg, rgba(var(--color-panel-rgb), 0.74), rgba(var(--color-accent-rgb), 0.08));
  color: var(--color-accent);
  font-family: var(--font-display);
  font-weight: 700;
}

.comment-list__body {
  min-width: 0;
}

.comment-list__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 14px;
  align-items: baseline;
}

.comment-list__nickname {
  color: var(--color-text);
  font-size: 0.9rem;
}

.comment-list__date {
  color: var(--color-muted);
  font-size: 0.76rem;
}

.comment-list__content {
  margin: 9px 0 0;
  color: var(--color-text);
  font-size: 0.94rem;
  line-height: 1.78;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.comment-list__reply { margin-top: 8px; padding: 0; border: 0; background: transparent; color: var(--color-muted); font-size: .72rem; font-weight: 700; cursor: pointer; }
.comment-list__reply:hover, .comment-list__reply:focus-visible { color: var(--color-accent-warm); outline: none; }
.comment-list__replies { display: grid; gap: 16px; margin: 18px 0 0; padding: 18px 0 0 18px; border-top: 1px solid rgba(var(--color-accent-rgb), .1); list-style: none; }
.comment-list__reply-item { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 12px; }
.comment-list__avatar--reply { width: 30px; height: 30px; font-size: .78rem; }
.comment-list__reply-target { color: var(--color-muted); font-size: .76rem; font-weight: 500; }
.comment-list__replies-toggle-item { padding-left: 42px; }
.comment-list__replies-toggle { padding: 0; border: 0; background: transparent; color: var(--color-accent); font-size: .76rem; font-weight: 700; cursor: pointer; }
.comment-list__replies-toggle:hover, .comment-list__replies-toggle:focus-visible { color: var(--color-accent-warm); outline: none; }
</style>
