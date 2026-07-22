<script setup lang="ts">
import SidebarCard from '~/components/home/SidebarCard.vue'
import type { HomeNavigationGroup, HomeRailCardSize } from '~/types/settings'
import { isSafeRootRelativeUrl } from '~/utils/public-url'

defineProps<{ title: string; size: HomeRailCardSize; groups: HomeNavigationGroup[] }>()
const internal = isSafeRootRelativeUrl
</script>

<template>
  <SidebarCard class="navigation-card" :title="title" :size="size">
    <div v-if="groups.length" class="navigation-card__groups">
      <section v-for="(group, groupIndex) in groups" :key="`${group.label}-${groupIndex}`" class="navigation-card__group">
        <h3>{{ group.label }}</h3>
        <div class="navigation-card__list">
          <template v-for="(link, linkIndex) in group.links" :key="`${link.url}-${linkIndex}`">
            <NuxtLink v-if="internal(link.url)" class="navigation-card__link" :to="link.url"><span>{{ link.label }}</span><small>{{ link.description || '→' }}</small></NuxtLink>
            <a v-else class="navigation-card__link" :href="link.url" :target="link.newTab ? '_blank' : undefined" :rel="link.newTab ? 'noopener noreferrer' : undefined"><span>{{ link.label }}</span><small>{{ link.description || '↗' }}</small></a>
          </template>
        </div>
      </section>
    </div>
    <p v-else>尚未配置导航入口。</p>
  </SidebarCard>
</template>

<style scoped>
.navigation-card__group+.navigation-card__group{margin-top:13px}.navigation-card__group h3{margin:0 0 6px;color:var(--color-muted);font-size:.62rem;letter-spacing:.08em;text-transform:uppercase}.navigation-card__list{display:grid;gap:7px}.navigation-card__link{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border:1px solid var(--color-line);border-radius:10px;color:var(--color-text);font-size:.75rem;font-weight:750;text-decoration:none}.navigation-card__link:hover{border-color:var(--color-accent)}.navigation-card__link small{overflow:hidden;color:var(--color-muted);font-size:.62rem;font-weight:500;text-overflow:ellipsis;white-space:nowrap}.navigation-card p{margin:0;color:var(--color-muted);font-size:.72rem}
</style>
