<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, toRaw } from 'vue'
import HomeCardsStructurePanel from '~/components/admin/HomeCardsStructurePanel.vue'
import HomeRailCardPreview from '~/components/admin/HomeRailCardPreview.vue'
import SettingsHomeForm from '~/components/admin/SettingsHomeForm.vue'
import { createHomeRailCard, homeRailCardLabels } from '~/components/admin/home-rail-card-admin'
import {
  apiErrorMessage,
  fetchSettingsDomain,
  settingsValidationIssues,
  updateSettingsDomain,
  type HomeSettings,
  type SettingsValidationIssue
} from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { publicResourceKey } from '~/composables/useStaleFirstPublicResource'
import type { HomeRailCard } from '~/types/settings'

const { t } = useTblogI18n()
const form = ref<HomeSettings | null>(null)
const persisted = ref<HomeSettings | null>(null)
const loading = ref(true)
const loadError = ref('')
const saveError = ref('')
const issues = ref<SettingsValidationIssue[]>([])
const savingCardId = ref<string | null>(null)
const savedCardId = ref<string | null>(null)
const previewCardId = ref<string | null>(null)
const structureSaving = ref(false)
const structureSaved = ref(false)
const drawer = ref<HTMLElement | null>(null)
const drawerClose = ref<HTMLButtonElement | null>(null)
let previewTrigger: HTMLElement | null = null
let previousBodyOverflow = ''

const clone = <T>(value: T): T => structuredClone(toRaw(value))
const previewCard = computed(() => form.value?.railCards.find((card) => card.instanceId === previewCardId.value) ?? null)
const unpersistedCardIds = computed(() => {
  const saved = new Set(persisted.value?.railCards.map((card) => card.instanceId) ?? [])
  return form.value?.railCards.filter((card) => !saved.has(card.instanceId)).map((card) => card.instanceId) ?? []
})
const busy = computed(() => Boolean(savingCardId.value) || structureSaving.value)
const structureDirty = computed(() => {
  const current = form.value?.railCards.map((card) => card.instanceId) ?? []
  const saved = persisted.value?.railCards.map((card) => card.instanceId) ?? []
  return current.length !== saved.length || current.some((id, index) => id !== saved[index])
})
const blockedCardIds = computed(() => structureDirty.value
  ? (form.value?.railCards.map((card) => card.instanceId) ?? [])
  : unpersistedCardIds.value)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetchSettingsDomain('home')
    form.value = clone(response.data)
    persisted.value = clone(response.data)
  } catch (error) {
    loadError.value = apiErrorMessage(error, t('settings.loadError'))
  } finally {
    loading.value = false
  }
}

async function saveCard(instanceId: string) {
  if (!form.value || !persisted.value || busy.value || structureDirty.value) return
  const draft = form.value.railCards.find((card) => card.instanceId === instanceId)
  if (!draft || !persisted.value.railCards.some((card) => card.instanceId === instanceId)) return
  const payload: HomeSettings = {
    railCards: persisted.value.railCards.map((card) => clone(card.instanceId === instanceId ? draft : card))
  }

  savingCardId.value = instanceId
  savedCardId.value = null
  saveError.value = ''
  issues.value = []
  try {
    const response = await updateSettingsDomain('home', payload)
    const liveDrafts = clone(form.value.railCards)
    const liveDraftById = new Map(liveDrafts.map((card) => [card.instanceId, card]))
    persisted.value = clone(response.data)
    const savedTarget = response.data.railCards.find((card) => card.instanceId === instanceId)
    form.value = {
      railCards: liveDrafts.map((card) => clone(card.instanceId === instanceId ? (savedTarget ?? card) : (liveDraftById.get(card.instanceId) ?? card)))
    }
    savedCardId.value = instanceId
  } catch (error) {
    issues.value = settingsValidationIssues(error)
    saveError.value = issues.value.length
      ? t('settings.validationError')
      : apiErrorMessage(error, t('settings.saveError'))
  } finally {
    savingCardId.value = null
  }
  if (savedCardId.value === instanceId && typeof refreshNuxtData === 'function') {
    try { await refreshNuxtData(publicResourceKey('site-config')) } catch { /* persisted save remains successful */ }
  }
}

function addCard(type: HomeRailCard['type']) {
  if (!form.value) return
  form.value.railCards.push(createHomeRailCard(type))
  structureSaved.value = false
}

function removeCard(instanceId: string) {
  if (!form.value) return
  form.value.railCards = form.value.railCards.filter((card) => card.instanceId !== instanceId)
  if (previewCardId.value === instanceId) closePreview()
  structureSaved.value = false
}

async function openPreview(instanceId: string) {
  previewTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  previewCardId.value = instanceId
  await nextTick()
  drawerClose.value?.focus()
}

function closePreview() {
  previewCardId.value = null
  document.body.style.overflow = previousBodyOverflow
  void nextTick(() => previewTrigger?.focus())
}

function handleDrawerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closePreview()
    return
  }
  if (event.key !== 'Tab' || !drawer.value) return
  const focusable = [...drawer.value.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
  if (!focusable.length) return
  const first = focusable[0]!
  const last = focusable.at(-1)!
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

onBeforeUnmount(() => { document.body.style.overflow = previousBodyOverflow })

function moveCard(from: number, to: number) {
  if (!form.value || from === to || to < 0 || to >= form.value.railCards.length) return
  const [card] = form.value.railCards.splice(from, 1)
  if (card) form.value.railCards.splice(to, 0, card)
  structureSaved.value = false
}

async function saveStructure() {
  if (!form.value || !persisted.value || busy.value) return
  const savedById = new Map(persisted.value.railCards.map((card) => [card.instanceId, card]))
  const payload: HomeSettings = {
    railCards: form.value.railCards.map((card) => clone(savedById.get(card.instanceId) ?? card))
  }
  structureSaving.value = true
  structureSaved.value = false
  saveError.value = ''
  issues.value = []
  try {
    const liveDraftById = new Map(form.value.railCards.map((card) => [card.instanceId, clone(card)]))
    const response = await updateSettingsDomain('home', payload)
    persisted.value = clone(response.data)
    form.value = {
      railCards: response.data.railCards.map((card) => clone(liveDraftById.get(card.instanceId) ?? card))
    }
    structureSaved.value = true
  } catch (error) {
    issues.value = settingsValidationIssues(error)
    saveError.value = issues.value.length ? t('settings.validationError') : apiErrorMessage(error, t('settings.saveError'))
  } finally {
    structureSaving.value = false
  }
  if (structureSaved.value && typeof refreshNuxtData === 'function') {
    try { await refreshNuxtData(publicResourceKey('site-config')) } catch { /* persisted save remains successful */ }
  }
}

void load()
</script>

<template>
  <section class="home-cards-admin">
    <header class="admin-page-header" :inert="Boolean(previewCard)">
      <div>
        <h1 class="admin-page-header__title">首页卡片</h1>
        <p class="admin-page-header__meta">配置 Personal Card 下方的扩展卡片；每张卡片独立保存与预览。</p>
      </div>
    </header>

    <div class="home-cards-admin__body" :inert="Boolean(previewCard)">
      <p v-if="loading" class="admin-muted">{{ t('common.loading') }}</p>
      <p v-else-if="loadError" class="admin-alert" role="alert">{{ loadError }}</p>
      <template v-else-if="form">
        <p v-if="saveError" class="admin-alert" role="alert" data-test="home-cards-save-error">{{ saveError }}</p>
        <HomeCardsStructurePanel
          :cards="form.railCards"
          :saving="structureSaving"
          :saved="structureSaved"
          :disabled="busy"
          @add="addCard"
          @remove="removeCard"
          @move="moveCard"
          @save="saveStructure"
        />
        <SettingsHomeForm
          :value="form"
          :issues="issues"
          :saving-card-id="savingCardId"
          :saved-card-id="savedCardId"
          :unpersisted-card-ids="blockedCardIds"
          :locked="busy"
          @save-card="saveCard"
          @preview-card="openPreview"
        />
      </template>
    </div>

    <Transition name="home-card-drawer">
      <div v-if="previewCard" class="home-card-preview-drawer" data-test="home-card-preview-drawer">
        <button class="home-card-preview-drawer__backdrop" type="button" aria-label="关闭预览" @click="closePreview" />
        <aside ref="drawer" role="dialog" aria-modal="true" aria-label="卡片预览" @keydown="handleDrawerKeydown">
          <header><div><small>卡片预览</small><h2>{{ homeRailCardLabels[previewCard.type] }}</h2></div><button ref="drawerClose" type="button" @click="closePreview">关闭</button></header>
          <HomeRailCardPreview :card="previewCard" />
        </aside>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.home-cards-admin{display:flex;flex-direction:column;gap:16px}.home-cards-admin__body{display:grid;gap:18px}
:deep(.settings-form){display:flex;flex-direction:column;gap:14px}:deep(.settings-field){display:flex;flex-direction:column;gap:5px}:deep(.settings-field--check){flex-direction:row;align-items:center;gap:8px}:deep(.settings-field__label){color:var(--color-text);font-size:.82rem;font-weight:700}:deep(.settings-field__input){padding:8px 10px;border:1px solid var(--color-line);border-radius:8px;background:var(--color-bg);color:var(--color-text);font:inherit}:deep(.settings-field__error){color:var(--color-accent-warm);font-size:.78rem}:deep(.settings-field-row){display:flex;gap:12px}:deep(.settings-field-row) .settings-field{flex:1}:deep(.settings-rows){display:flex;flex-direction:column;gap:8px}:deep(.settings-rows__row){display:flex;gap:8px}:deep(.settings-rows__row) .settings-field__input{flex:1}:deep(.settings-rows__add),:deep(.settings-rows__remove){min-height:32px;padding:5px 11px;border:1px solid var(--color-line);border-radius:8px;background:var(--color-panel);color:var(--color-text);font-weight:700;cursor:pointer}:deep(.settings-rows__add){align-self:flex-start}
@media(max-width:640px){:deep(.settings-field-row){flex-direction:column}}
.home-card-preview-drawer{position:fixed;z-index:80;inset:0}.home-card-preview-drawer__backdrop{position:absolute;inset:0;border:0;background:rgba(15,22,27,.38);cursor:default}.home-card-preview-drawer aside{position:absolute;top:0;right:0;width:min(390px,92vw);height:100%;padding:22px;overflow:auto;border-left:1px solid var(--color-line);background:var(--color-panel);box-shadow:-24px 0 60px rgba(0,0,0,.2)}.home-card-preview-drawer aside>header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--color-line)}.home-card-preview-drawer h2,.home-card-preview-drawer small{display:block;margin:0}.home-card-preview-drawer small{color:var(--color-accent);font-size:.7rem;font-weight:800}.home-card-preview-drawer h2{margin-top:3px;font-size:1.05rem}.home-card-preview-drawer header button{padding:7px 10px;border:1px solid var(--color-line);border-radius:8px;background:var(--color-bg);color:var(--color-text);cursor:pointer}.home-card-drawer-enter-active,.home-card-drawer-leave-active{transition:opacity .2s ease}.home-card-drawer-enter-active aside,.home-card-drawer-leave-active aside{transition:transform .24s ease}.home-card-drawer-enter-from,.home-card-drawer-leave-to{opacity:0}.home-card-drawer-enter-from aside,.home-card-drawer-leave-to aside{transform:translateX(100%)}
</style>
