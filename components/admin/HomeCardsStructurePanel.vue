<script setup lang="ts">
import { shallowRef } from 'vue'
import { homeRailCardLabels } from '~/components/admin/home-rail-card-admin'
import { homeRailCardCatalogDefaults, type HomeRailCard } from '~/types/settings'

const props = defineProps<{
  cards: HomeRailCard[]
  saving?: boolean
  saved?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{
  add: [type: HomeRailCard['type']]
  remove: [instanceId: string]
  move: [from: number, to: number]
  save: []
}>()

const selectedType = shallowRef<HomeRailCard['type'] | ''>('')
const draggedIndex = shallowRef<number | null>(null)

function add() {
  if (props.disabled || !selectedType.value) return
  emit('add', selectedType.value)
  selectedType.value = ''
}

function drop(to: number) {
  if (props.disabled) return
  if (draggedIndex.value !== null && draggedIndex.value !== to) emit('move', draggedIndex.value, to)
  draggedIndex.value = null
}
</script>

<template>
  <section class="home-cards-structure" data-test="home-cards-structure">
    <header>
      <div><h2>卡片结构</h2><p>选择卡片加入首页，并在这里集中调整显示顺序。</p></div>
      <div class="home-cards-structure__add">
        <select v-model="selectedType" data-test="home-card-library-select" :disabled="disabled">
          <option value="">选择卡片类型</option>
          <option v-for="card in homeRailCardCatalogDefaults" :key="card.type" :value="card.type">{{ homeRailCardLabels[card.type] }}</option>
        </select>
        <button type="button" :disabled="disabled || !selectedType" data-test="home-card-library-add" @click="add">添加卡片</button>
      </div>
    </header>

    <p v-if="!cards.length" class="home-cards-structure__empty">尚未加入扩展卡片。Personal Card 仍会固定显示。</p>
    <ol v-else class="home-cards-structure__list">
      <li
        v-for="(card, index) in cards"
        :key="card.instanceId"
        :draggable="!disabled"
        :data-test="`home-card-order-${card.instanceId}`"
        @dragstart="draggedIndex = index"
        @dragover.prevent
        @drop="drop(index)"
      >
        <span class="home-cards-structure__handle" aria-hidden="true">⠿</span>
        <span class="home-cards-structure__index">{{ String(index + 1).padStart(2, '0') }}</span>
        <strong>{{ homeRailCardLabels[card.type] }}</strong>
        <small>{{ card.enabled ? '公开' : '隐藏' }}</small>
        <div class="home-cards-structure__actions">
          <button type="button" :disabled="disabled || index === 0" @click="emit('move', index, index - 1)">上移</button>
          <button type="button" :disabled="disabled || index === cards.length - 1" @click="emit('move', index, index + 1)">下移</button>
          <button type="button" class="danger" :disabled="disabled" @click="emit('remove', card.instanceId)">移除</button>
        </div>
      </li>
    </ol>

    <footer>
      <span v-if="saved" role="status">卡片结构已保存</span>
      <button type="button" data-test="home-card-structure-save" :disabled="disabled || saving" @click="emit('save')">
        {{ saving ? '保存中…' : '保存卡片结构' }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.home-cards-structure{display:grid;gap:15px;padding:18px;border:1px solid var(--color-line);border-radius:14px;background:var(--color-panel);box-shadow:var(--shadow-card)}header,footer,.home-cards-structure__add,.home-cards-structure__actions,.home-cards-structure__list li{display:flex;align-items:center;gap:9px}header{justify-content:space-between}h2,p{margin:0}h2{font-size:1rem}header p,.home-cards-structure__empty{margin-top:4px;color:var(--color-muted);font-size:.76rem}.home-cards-structure__add select{min-width:180px;padding:8px;border:1px solid var(--color-line);border-radius:8px;background:var(--color-bg);color:var(--color-text)}button{min-height:34px;padding:6px 10px;border:1px solid var(--color-line);border-radius:8px;background:var(--color-bg);color:var(--color-text);font-weight:700;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.home-cards-structure__list{display:grid;gap:7px;margin:0;padding:0;list-style:none}.home-cards-structure__list li{padding:9px 10px;border:1px solid var(--color-line);border-radius:10px;background:var(--color-bg)}.home-cards-structure__handle{color:var(--color-muted);cursor:grab}.home-cards-structure__index,small{color:var(--color-muted);font-size:.68rem}.home-cards-structure__list strong{min-width:0;flex:1;font-size:.8rem}.home-cards-structure__actions button{min-height:28px;padding:4px 8px;font-size:.68rem}.home-cards-structure__actions .danger{color:var(--color-accent-warm)}footer{justify-content:flex-end;padding-top:2px}footer span{margin-right:auto;color:var(--admin-success);font-size:.78rem;font-weight:800}footer>button{border-color:transparent;background:var(--color-accent);color:#fff}@media(max-width:720px){header{align-items:stretch;flex-direction:column}.home-cards-structure__add select{min-width:0;flex:1}.home-cards-structure__list li{flex-wrap:wrap}.home-cards-structure__actions{width:100%;justify-content:flex-end}}
</style>
