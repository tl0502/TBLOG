<script setup lang="ts">
import SidebarCard from '~/components/home/SidebarCard.vue'
import type { HomeFriendLink, HomeRailCardSize } from '~/types/settings'

defineProps<{ title: string; size: HomeRailCardSize; links: HomeFriendLink[] }>()
</script>

<template>
  <SidebarCard class="friend-links-card" :title="title" :size="size">
    <div v-if="links.length" class="friend-links-card__list">
      <a v-for="(link, index) in links" :key="`${link.url}-${index}`" class="friend-links-card__link" :href="link.url" :target="link.newTab ? '_blank' : undefined" :rel="link.newTab ? 'noopener noreferrer' : undefined">
        <img v-if="link.logoUrl" :src="link.logoUrl" alt="" class="friend-links-card__logo">
        <span v-else class="friend-links-card__fallback">{{ link.label.slice(0, 1).toUpperCase() }}</span>
        <span><b>{{ link.label }}</b><small>{{ link.description }}</small></span>
      </a>
    </div>
    <p v-else>暂时还没有公开友链。</p>
  </SidebarCard>
</template>

<style scoped>
.friend-links-card__list{display:grid;gap:7px}.friend-links-card__link{display:grid;grid-template-columns:34px minmax(0,1fr);gap:9px;align-items:center;padding:7px;border-radius:10px;color:var(--color-text);text-decoration:none}.friend-links-card__link:hover{background:rgba(var(--color-accent-rgb),.07)}.friend-links-card__logo,.friend-links-card__fallback{width:34px;height:34px;border:1px solid var(--color-line);border-radius:11px;object-fit:cover}.friend-links-card__fallback{display:grid;color:var(--color-accent);font-weight:850;place-items:center}.friend-links-card b,.friend-links-card small{display:block}.friend-links-card b{font-size:.77rem}.friend-links-card small,.friend-links-card p{overflow:hidden;color:var(--color-muted);font-size:.65rem;text-overflow:ellipsis;white-space:nowrap}.friend-links-card p{margin:0}
</style>
