<script setup lang="ts">
import { homeRailCardLabels } from '~/components/admin/home-rail-card-admin'
import { settingsIssueMessage, type HomeSettings, type SettingsValidationIssue } from '~/composables/useAdminApi'
import type { HomeContentMetric, HomeRailCard } from '~/types/settings'

const props = defineProps<{
  value: HomeSettings
  issues: SettingsValidationIssue[]
  savingCardId?: string | null
  savedCardId?: string | null
  unpersistedCardIds?: string[]
  locked?: boolean
}>()
const emit = defineEmits<{ saveCard: [instanceId: string]; previewCard: [instanceId: string] }>()
const err = (path: (string | number)[]) => settingsIssueMessage(props.issues, path)
const metricOptions: Array<{ value: HomeContentMetric; label: string }> = [
  { value: 'articles', label: '公开文章' },
  { value: 'categories', label: '内容分类' },
  { value: 'tags', label: '主题标签' },
  { value: 'pageViews', label: '文章浏览（已发布统计报告）' }
]

function addBuildLogEntry(index: number) {
  const card = props.value.railCards[index]
  if (card?.type === 'build-log') card.entries.push('')
}

function removeBuildLogEntry(cardIndex: number, entryIndex: number) {
  const card = props.value.railCards[cardIndex]
  if (card?.type === 'build-log') card.entries.splice(entryIndex, 1)
}

function toggleMetric(index: number, metric: HomeContentMetric) {
  const card = props.value.railCards[index]
  if (card?.type !== 'content-stats') return
  card.metrics = card.metrics.includes(metric)
    ? card.metrics.filter((item) => item !== metric)
    : [...card.metrics, metric]
}

function addFriend(index: number) {
  const card = props.value.railCards[index]
  if (card?.type === 'friend-links') card.links.push({ label: '', url: '', description: '', logoUrl: null, newTab: true })
}
function removeFriend(index: number, linkIndex: number) {
  const card = props.value.railCards[index]
  if (card?.type === 'friend-links') card.links.splice(linkIndex, 1)
}
function addNavigationGroup(index: number) {
  const card = props.value.railCards[index]
  if (card?.type === 'navigation') card.groups.push({ label: '', links: [] })
}
function removeNavigationGroup(index: number, groupIndex: number) {
  const card = props.value.railCards[index]
  if (card?.type === 'navigation') card.groups.splice(groupIndex, 1)
}
function addNavigationLink(index: number, groupIndex: number) {
  const card = props.value.railCards[index]
  if (card?.type === 'navigation') card.groups[groupIndex]?.links.push({ label: '', url: '', description: '', newTab: false })
}
function removeNavigationLink(index: number, groupIndex: number, linkIndex: number) {
  const card = props.value.railCards[index]
  if (card?.type === 'navigation') card.groups[groupIndex]?.links.splice(linkIndex, 1)
}
function addChapter(index: number) {
  const card = props.value.railCards[index]
  if (card?.type === 'reading-series') card.chapters.push({ title: '', url: '', published: true })
}
function removeChapter(index: number, chapterIndex: number) {
  const card = props.value.railCards[index]
  if (card?.type === 'reading-series') card.chapters.splice(chapterIndex, 1)
}
function addActivity(index: number) {
  const card = props.value.railCards[index]
  if (card?.type === 'site-activity') card.manualEntries.push({ date: new Date().toISOString(), title: '', detail: '', url: null })
}
function removeActivity(index: number, entryIndex: number) {
  const card = props.value.railCards[index]
  if (card?.type === 'site-activity') card.manualEntries.splice(entryIndex, 1)
}
function setArticleSlugs(index: number, event: Event) {
  const card = props.value.railCards[index]
  if (card?.type !== 'curated-topic') return
  card.articleSlugs = (event.target as HTMLTextAreaElement).value
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
}

</script>

<template>
  <fieldset class="settings-form home-card-settings" :disabled="locked">
    <p class="admin-muted">个人卡固定显示在最上方，不受这里的配置影响。扩展卡片宽度一致，高度由内容决定。</p>

    <article
      v-for="(card, index) in value.railCards"
      :key="card.instanceId"
      class="home-card-settings__card"
      :data-test="`home-card-${card.instanceId}`"
    >
      <header class="home-card-settings__header">
        <div>
          <strong>{{ homeRailCardLabels[card.type] }}</strong>
          <small>{{ card.type }}</small>
        </div>
      </header>

      <label class="settings-field settings-field--check">
        <input v-model="card.enabled" type="checkbox">
        <span class="settings-field__label">公开显示</span>
      </label>

      <div class="settings-field-row">
        <label class="settings-field">
          <span class="settings-field__label">标题</span>
          <input v-model="card.title" class="settings-field__input">
          <span v-if="err(['railCards', index, 'title'])" class="settings-field__error">{{ err(['railCards', index, 'title']) }}</span>
        </label>
        <label class="settings-field">
          <span class="settings-field__label">间距尺寸</span>
          <select v-model="card.size" class="settings-field__input">
            <option value="compact">紧凑</option>
            <option value="normal">标准</option>
            <option value="large">宽松</option>
          </select>
        </label>
      </div>

      <label v-if="card.type === 'tags'" class="settings-field">
        <span class="settings-field__label">折叠时显示数量</span>
        <input v-model.number="card.collapsedCount" type="number" min="1" max="100" class="settings-field__input">
        <span v-if="err(['railCards', index, 'collapsedCount'])" class="settings-field__error">{{ err(['railCards', index, 'collapsedCount']) }}</span>
      </label>

      <div v-else-if="card.type === 'build-log'" class="settings-rows">
        <span class="settings-field__label">日志条目</span>
        <div v-for="(_, entryIndex) in card.entries" :key="entryIndex" class="settings-rows__row">
          <input v-model="card.entries[entryIndex]" class="settings-field__input" :data-test="`build-log-entry-${entryIndex}`">
          <button type="button" class="settings-rows__remove" @click="removeBuildLogEntry(index, entryIndex)">移除</button>
        </div>
        <button type="button" class="settings-rows__add" @click="addBuildLogEntry(index)">添加条目</button>
        <span v-if="err(['railCards', index, 'entries'])" class="settings-field__error">{{ err(['railCards', index, 'entries']) }}</span>
      </div>

      <div v-else-if="card.type === 'content-stats'" class="home-card-settings__checks">
        <label v-for="option in metricOptions" :key="option.value" class="settings-field settings-field--check">
          <input type="checkbox" :checked="card.metrics.includes(option.value)" @change="toggleMetric(index, option.value)">
          <span class="settings-field__label">{{ option.label }}</span>
        </label>
        <span v-if="err(['railCards', index, 'metrics'])" class="settings-field__error">{{ err(['railCards', index, 'metrics']) }}</span>
      </div>

      <div v-else-if="card.type === 'site-history'" class="settings-field-row">
        <label class="settings-field"><span class="settings-field__label">建站日期</span><input :value="card.startDate ?? ''" type="date" class="settings-field__input" @input="card.startDate = (($event.target as HTMLInputElement).value || null)"></label>
        <label class="settings-field settings-field--check"><input v-model="card.showStartDate" type="checkbox"><span>显示建站日期</span></label>
        <label class="settings-field settings-field--check"><input v-model="card.showLastUpdated" type="checkbox"><span>显示最近更新</span></label>
      </div>

      <div v-else-if="card.type === 'publishing-rhythm'" class="settings-field-row">
        <label class="settings-field"><span class="settings-field__label">统计周数</span><input v-model.number="card.weeks" type="number" min="4" max="12" class="settings-field__input"></label>
        <label class="settings-field settings-field--check"><input v-model="card.includeUpdates" type="checkbox"><span>同时统计公开更新</span></label>
      </div>

      <div v-else-if="card.type === 'friend-links'" class="settings-rows">
        <div v-for="(link, linkIndex) in card.links" :key="linkIndex" class="home-card-settings__nested">
          <div class="settings-field-row"><input v-model="link.label" class="settings-field__input" placeholder="网站名称"><input v-model="link.url" class="settings-field__input" placeholder="https://..."></div>
          <input v-model="link.description" class="settings-field__input" placeholder="简短描述">
          <input v-model="link.logoUrl" class="settings-field__input" placeholder="Logo URL（可选）">
          <div class="home-card-settings__nested-actions"><label><input v-model="link.newTab" type="checkbox"> 新窗口打开</label><button type="button" class="settings-rows__remove" @click="removeFriend(index, linkIndex)">移除</button></div>
        </div>
        <button type="button" class="settings-rows__add" @click="addFriend(index)">添加友链</button>
      </div>

      <div v-else-if="card.type === 'navigation'" class="settings-rows">
        <div v-for="(group, groupIndex) in card.groups" :key="groupIndex" class="home-card-settings__nested">
          <div class="home-card-settings__nested-actions"><input v-model="group.label" class="settings-field__input" placeholder="分组名称，例如：其他网站"><button type="button" class="settings-rows__remove" @click="removeNavigationGroup(index, groupIndex)">移除分组</button></div>
          <div v-for="(link, linkIndex) in group.links" :key="linkIndex" class="home-card-settings__link-row">
            <input v-model="link.label" class="settings-field__input" placeholder="名称">
            <input v-model="link.url" class="settings-field__input" placeholder="/archive 或 https://other-site.com">
            <input v-model="link.description" class="settings-field__input" placeholder="说明（可选）">
            <label><input v-model="link.newTab" type="checkbox"> 新窗口</label>
            <button type="button" class="settings-rows__remove" @click="removeNavigationLink(index, groupIndex, linkIndex)">移除</button>
          </div>
          <button type="button" class="settings-rows__add" @click="addNavigationLink(index, groupIndex)">添加入口</button>
        </div>
        <button type="button" class="settings-rows__add" @click="addNavigationGroup(index)">添加导航分组</button>
      </div>

      <div v-else-if="card.type === 'curated-topic'" class="settings-rows">
        <div class="settings-field-row"><input v-model="card.eyebrow" class="settings-field__input" placeholder="眉题"><input v-model="card.topicTitle" class="settings-field__input" placeholder="专题名称"></div>
        <textarea v-model="card.summary" class="settings-field__input" rows="3" placeholder="专题说明" />
        <input v-model="card.coverUrl" class="settings-field__input" placeholder="专题封面 URL（可选）">
        <input v-model="card.targetUrl" class="settings-field__input" placeholder="专题入口：站内路径或其他网站">
        <label class="settings-field"><span class="settings-field__label">用于统计公开文章数量的 Slug（每行一个）</span><textarea :value="card.articleSlugs.join('\n')" class="settings-field__input" rows="4" @input="setArticleSlugs(index, $event)" /></label>
      </div>

      <div v-else-if="card.type === 'reading-series'" class="settings-rows">
        <div class="settings-field-row"><input v-model="card.seriesTitle" class="settings-field__input" placeholder="系列名称"><select v-model="card.status" class="settings-field__input"><option value="ongoing">连载中</option><option value="complete">已完结</option></select></div>
        <label class="settings-field settings-field--check"><input v-model="card.showProgress" type="checkbox"><span>显示浏览器本地阅读进度</span></label>
        <div v-for="(chapter, chapterIndex) in card.chapters" :key="chapterIndex" class="home-card-settings__link-row">
          <input v-model="chapter.title" class="settings-field__input" placeholder="章节名称"><input v-model="chapter.url" class="settings-field__input" placeholder="站内路径或外部网站"><label><input v-model="chapter.published" type="checkbox"> 公开</label><button type="button" class="settings-rows__remove" @click="removeChapter(index, chapterIndex)">移除</button>
        </div>
        <button type="button" class="settings-rows__add" @click="addChapter(index)">添加章节</button>
      </div>

      <div v-else-if="card.type === 'site-activity'" class="settings-rows">
        <div class="settings-field-row"><label class="settings-field"><span class="settings-field__label">最大条目</span><input v-model.number="card.limit" type="number" min="1" max="20" class="settings-field__input"></label><label class="settings-field settings-field--check"><input v-model="card.includePublished" type="checkbox"><span>自动显示发布</span></label><label class="settings-field settings-field--check"><input v-model="card.includeUpdated" type="checkbox"><span>自动显示更新</span></label></div>
        <div v-for="(entry, entryIndex) in card.manualEntries" :key="entryIndex" class="home-card-settings__nested">
          <input v-model="entry.date" class="settings-field__input" placeholder="ISO 时间"><input v-model="entry.title" class="settings-field__input" placeholder="动态标题"><input v-model="entry.detail" class="settings-field__input" placeholder="动态说明"><input v-model="entry.url" class="settings-field__input" placeholder="可选链接"><button type="button" class="settings-rows__remove" @click="removeActivity(index, entryIndex)">移除</button>
        </div>
        <button type="button" class="settings-rows__add" @click="addActivity(index)">添加公开动态</button>
      </div>

      <footer class="home-card-settings__footer">
        <span v-if="savedCardId === card.instanceId" class="home-card-settings__saved" role="status">已保存</span>
        <div class="home-card-settings__footer-actions">
          <button type="button" class="home-card-settings__preview" :data-test="`home-card-preview-${card.instanceId}`" @click="emit('previewCard', card.instanceId)">
            预览卡片
          </button>
          <button type="button" class="home-card-settings__save" :data-test="`home-card-save-${card.instanceId}`" :disabled="Boolean(savingCardId) || unpersistedCardIds?.includes(card.instanceId)" @click="emit('saveCard', card.instanceId)">
            {{ unpersistedCardIds?.includes(card.instanceId) ? '先保存卡片结构' : savingCardId === card.instanceId ? '保存中…' : '保存此卡片' }}
          </button>
        </div>
      </footer>
    </article>
  </fieldset>
</template>

<style scoped>
.home-card-settings__card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--color-line);
  border-radius: 12px;
  background: var(--color-bg);
}

.home-card-settings {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.home-card-settings__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.home-card-settings__header small {
  display: block;
  margin-top: 2px;
  color: var(--color-muted);
}

.home-card-settings__checks,
.home-card-settings__nested,
.home-card-settings__link-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.home-card-settings__nested {
  padding: 12px;
  border: 1px solid var(--color-line);
  border-radius: 10px;
}

.home-card-settings__nested-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.home-card-settings__nested-actions .settings-field__input {
  flex: 1;
}

.home-card-settings__link-row {
  padding: 10px;
  border-left: 2px solid var(--color-line);
}

.home-card-settings__footer,.home-card-settings__footer-actions{display:flex;align-items:center;justify-content:space-between;gap:10px}.home-card-settings__footer{padding-top:14px;border-top:1px solid var(--color-line)}.home-card-settings__footer-actions{margin-left:auto}.home-card-settings__preview,.home-card-settings__save{min-height:36px;padding:8px 13px;border-radius:8px;font-weight:750;cursor:pointer}.home-card-settings__preview{border:1px solid var(--color-line);background:var(--color-panel);color:var(--color-text)}.home-card-settings__save{border:0;background:var(--color-accent);color:#fff}.home-card-settings__save:disabled{opacity:.58;cursor:not-allowed}.home-card-settings__saved{color:var(--admin-success);font-size:.78rem;font-weight:800}
</style>
