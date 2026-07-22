<script setup lang="ts">
const error = useError()
</script>

<template>
  <NuxtLayout>
    <main class="error-page">
      <p class="error-page__code">{{ error?.statusCode ?? 500 }}</p>
      <h1>{{ error?.statusMessage || 'Something went wrong.' }}</h1>
      <NuxtLink to="/">Return home</NuxtLink>
    </main>
  </NuxtLayout>
</template>

<style scoped>
.error-page { display: grid; min-height: 50vh; place-content: center; gap: 12px; padding: 48px 24px; color: var(--color-text); text-align: center; }
.error-page__code { margin: 0; color: var(--color-accent-warm); font-family: var(--font-display); font-size: 4rem; font-weight: 800; }
.error-page h1 { margin: 0; font-size: 1.4rem; }
.error-page a { color: var(--color-accent); font-weight: 700; }
</style>
