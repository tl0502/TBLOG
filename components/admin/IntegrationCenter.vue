<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import IntegrationProviderCard, {
  type IntegrationSavePayload
} from '~/components/admin/IntegrationProviderCard.vue'
import {
  apiErrorMessage,
  runIntegrationAction,
  updateIntegration,
  useAdminIntegrations,
  type IntegrationCapability,
  type IntegrationView
} from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { publicResourceKey } from '~/composables/useStaleFirstPublicResource'

const { t } = useTblogI18n()

interface Props {
  capabilities?: IntegrationCapability[]
  embedded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  capabilities: () => [],
  embedded: false
})

const { data, pending, error, refresh } = await useAdminIntegrations()

// Local mirror so a save/action can refresh only the affected provider from its returned view.
const views = ref<IntegrationView[]>([])
watch(data, (next) => {
  views.value = next?.data ? [...next.data] : []
}, { immediate: true })

const readError = computed(() => error.value
  ? apiErrorMessage(error.value, t('integrations.loadError'))
  : '')

function capabilityLabel(capability: IntegrationCapability): string {
  const keys: Record<IntegrationCapability, Parameters<typeof t>[0]> = {
    search: 'integrations.search', analytics: 'settings.analytics', analyticsReport: 'integrations.analyticsReport', image: 'integrations.image',
    storage: 'integrations.storage', cache: 'integrations.cache', commentProtection: 'integrations.commentProtection',
    commentModeration: 'integrations.commentModeration', commentReplica: 'integrations.commentReplica'
  }
  return t(keys[capability])
}

const groups = computed(() => {
  const order: IntegrationCapability[] = []
  const buckets = new Map<IntegrationCapability, IntegrationView[]>()
  for (const view of views.value) {
    if (props.capabilities.length > 0 && !props.capabilities.includes(view.capability)) continue
    if (!buckets.has(view.capability)) {
      buckets.set(view.capability, [])
      order.push(view.capability)
    }
    buckets.get(view.capability)!.push(view)
  }
  return order.map((capability) => ({
    capability,
    label: capabilityLabel(capability),
    providers: buckets.get(capability)!
  }))
})

function providerId(view: Pick<IntegrationView, 'capability' | 'providerKey'>) {
  return `${view.capability}/${view.providerKey}`
}

const busyId = ref<string | null>(null)
const opErrors = ref<Record<string, string>>({})

function replaceView(next: IntegrationView) {
  const id = providerId(next)
  const index = views.value.findIndex((view) => providerId(view) === id)
  if (index >= 0) {
    views.value.splice(index, 1, next)
  }
}

async function runOperation(
  view: IntegrationView,
  operation: () => Promise<{ data: IntegrationView }>,
  fallback: string,
  refreshAfter = true
) {
  const id = providerId(view)
  if (busyId.value) {
    return
  }
  busyId.value = id
  opErrors.value = { ...opErrors.value, [id]: '' }
  try {
    const result = await operation()
    replaceView(result.data)
    if (refreshAfter) await refresh()
    if (refreshAfter && typeof refreshNuxtData === 'function') {
      await refreshNuxtData(publicResourceKey('site-config'))
      if (view.capability === 'search') {
        await refreshNuxtData(publicResourceKey('search-config'))
      }
    }
  } catch (caught) {
    opErrors.value = { ...opErrors.value, [id]: apiErrorMessage(caught, fallback) }
  } finally {
    busyId.value = null
  }
}

function onSave(view: IntegrationView, payload: IntegrationSavePayload) {
  void runOperation(
    view,
    () => updateIntegration(view.capability, view.providerKey, payload),
    t('integrations.saveError')
  )
}

function onAction(view: IntegrationView, actionKey: string, draftConfig: Record<string, unknown> = {}) {
  void runOperation(
    view,
    () => runIntegrationAction(view.capability, view.providerKey, actionKey, { config: draftConfig }),
    t('integrations.actionError')
  )
}
</script>

<template>
  <section class="admin-integrations" :class="{ 'admin-integrations--embedded': props.embedded }">
    <div v-if="!props.embedded" class="admin-page-header">
      <div>
        <h1 class="admin-page-header__title">{{ t('admin.integrations') }}</h1>
        <p class="admin-page-header__meta">
          {{ t('integrations.meta') }}
        </p>
      </div>
    </div>

    <p v-if="readError" class="admin-alert" role="alert" data-test="integrations-read-error">
      {{ readError }}
    </p>
    <p v-else-if="pending" class="admin-integrations__loading">{{ t('integrations.loading') }}</p>
    <p
      v-else-if="groups.length === 0"
      class="admin-integrations__empty"
      data-test="integrations-empty"
    >
      {{ t('integrations.empty') }}
    </p>
    <template v-else>
      <section
        v-for="group in groups"
        :key="group.capability"
        class="admin-integrations__group"
        :data-test="`integration-group-${group.capability}`"
      >
        <h2 class="admin-integrations__group-title">{{ group.label }}</h2>
        <div class="admin-integrations__grid">
          <IntegrationProviderCard
            v-for="provider in group.providers"
            :key="providerId(provider)"
            :integration="provider"
            :busy="busyId === providerId(provider)"
            :error="opErrors[providerId(provider)] ?? ''"
            @save="onSave(provider, $event)"
            @action="(actionKey, draftConfig) => onAction(provider, actionKey, draftConfig)"
          />
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.admin-integrations {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.admin-integrations__loading,
.admin-integrations__empty {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.84rem;
}

.admin-integrations__group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-integrations__group-title {
  margin: 0;
  color: var(--color-text);
  font-size: 1.15rem;
}

.admin-integrations__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
</style>
