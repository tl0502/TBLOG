<script setup lang="ts">
import CommentModerationView from '~/components/admin/CommentModerationView.vue'

definePageMeta({ layout: 'admin', middleware: 'admin' })
</script>

<template>
  <CommentModerationView />
</template>
