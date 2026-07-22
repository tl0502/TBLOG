<script setup lang="ts">
import SettingsView from '~/components/admin/SettingsView.vue'

definePageMeta({ layout: 'admin', middleware: 'admin' })
</script>

<template>
  <SettingsView />
</template>
