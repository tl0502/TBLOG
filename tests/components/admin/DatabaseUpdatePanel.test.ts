import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, shallowRef } from 'vue'

const api = vi.hoisted(() => ({
  apiErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
  applyAdminMigrations: vi.fn(),
  useAdminMigrationStatus: vi.fn()
}))

vi.mock('~/composables/useAdminApi', () => api)
vi.mock('~/composables/useTblogI18n', () => ({
  useTblogI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key
      return `${key}:${JSON.stringify(params)}`
    }
  })
}))

async function mountPanel() {
  const Panel = (await import('../../../components/admin/DatabaseUpdatePanel.vue')).default
  const Host = defineComponent({
    components: { Panel },
    template: '<Suspense><Panel /></Suspense>'
  })
  const wrapper = mount(Host)
  await flushPromises()
  return wrapper
}

describe('DatabaseUpdatePanel', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('renders an in-sync hero with version metrics when nothing is pending', async () => {
    api.useAdminMigrationStatus.mockReturnValue({
      data: shallowRef({
        data: {
          currentVersion: 31,
          latestVersion: 31,
          appliedCount: 31,
          pendingCount: 0,
          applied: ['0030_mysterious_luke_cage.sql'],
          pending: []
        }
      }),
      pending: shallowRef(false),
      error: shallowRef(null),
      refresh: vi.fn()
    })

    const wrapper = await mountPanel()

    expect(wrapper.get('[data-test="db-update-hero"]').classes().join(' ')).toContain('db-update__hero--ok')
    expect(wrapper.get('[data-test="db-update-current"]').text()).toBe('31')
    expect(wrapper.get('[data-test="db-update-latest"]').text()).toBe('31')
    expect(wrapper.find('[data-test="db-update-ready"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="db-update-apply"]').exists()).toBe(false)
  })

  it('lists pending migrations and confirms before applying', async () => {
    const refresh = vi.fn()
    api.useAdminMigrationStatus.mockReturnValue({
      data: shallowRef({
        data: {
          currentVersion: 30,
          latestVersion: 31,
          appliedCount: 30,
          pendingCount: 1,
          applied: ['0029_living_morlocks.sql'],
          pending: ['0030_mysterious_luke_cage.sql']
        }
      }),
      pending: shallowRef(false),
      error: shallowRef(null),
      refresh
    })
    api.applyAdminMigrations.mockResolvedValue({
      data: {
        appliedNow: ['0030_mysterious_luke_cage.sql'],
        pending: [],
        currentVersion: 31,
        latestVersion: 31,
        durationMs: 42
      }
    })

    const wrapper = await mountPanel()

    expect(wrapper.get('[data-test="db-update-pending"]').text()).toContain('0030_mysterious_luke_cage.sql')
    await wrapper.get('[data-test="db-update-apply"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="db-update-confirm-box"]').exists()).toBe(true)

    await wrapper.get('[data-test="db-update-confirm"]').trigger('click')
    await flushPromises()

    expect(api.applyAdminMigrations).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-test="db-update-result"]').text()).toContain('0030_mysterious_luke_cage.sql')
    expect(wrapper.get('[data-test="db-update-result"]').text()).toContain('42ms')
  })
})
