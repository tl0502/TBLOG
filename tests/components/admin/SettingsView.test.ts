import { flushPromises, mount } from '@vue/test-utils'
import SettingsView from '../../../components/admin/SettingsView.vue'

const reportApi = vi.hoisted(() => ({
  data: null as unknown,
  pending: false,
  error: null as unknown,
  refresh: vi.fn(),
  update: vi.fn()
}))

vi.mock('~/composables/useAdminApi', async (importOriginal) => {
  const { shallowRef } = await import('vue')
  return {
    ...await importOriginal<typeof import('../../../composables/useAdminApi')>(),
    useAdminAnalyticsReportStatus: () => ({
      data: shallowRef(reportApi.data),
      pending: shallowRef(reportApi.pending),
      error: shallowRef(reportApi.error),
      refresh: reportApi.refresh
    }),
    updateAdminAnalyticsReportSettings: reportApi.update,
    syncAdminAnalyticsReport: vi.fn()
  }
})

describe('SettingsView', () => {
  beforeEach(() => {
    reportApi.data = { data: {
      enabled: true, schedule: 'daily', timeOfDay: '03:00', timezone: 'UTC', dayOfWeek: 'mon',
      lastSuccessAt: null, lastError: null
    } }
    reportApi.pending = false
    reportApi.error = null
    vi.clearAllMocks()
  })
  it('keeps profile editing out of settings domains', () => {
    const wrapper = mount(SettingsView, {
      global: {
        stubs: {
          SettingsDomainPanel: { props: ['domain'], template: '<div data-test="domain-panel" :data-domain="domain" />' },
          SettingsSecurityView: true,
          SettingsMediaForm: true,
          IntegrationCenter: true
        }
      }
    })

    expect(wrapper.find('[data-test="settings-tab-profile"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="settings-tab-home"]').exists()).toBe(false)
  })

  it('renders registry-driven analytics providers without the legacy domain editor', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        stubs: {
          SettingsDomainPanel: { template: '<div data-test="domain-panel" />' },
          SettingsSecurityView: true,
          SettingsMediaForm: true,
          IntegrationCenter: {
            props: ['capabilities'],
            template: '<div data-test="integration-center" :data-capabilities="capabilities.join(\',\')" />'
          }
        }
      }
    })

    await wrapper.get('[data-test="settings-tab-analytics"]').trigger('click')

    expect(wrapper.find('[data-test="domain-panel"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="integration-center"]').attributes('data-capabilities')).toBe('analytics,analyticsReport')
  })

  it('blocks report settings writes when status loading fails', async () => {
    reportApi.data = null
    reportApi.error = { data: { error: { message: 'status unavailable' } } }
    const wrapper = mount(SettingsView, { global: { stubs: { SettingsDomainPanel: true, SettingsSecurityView: true, SettingsMediaForm: true, IntegrationCenter: true } } })

    await wrapper.get('[data-test="settings-tab-analytics"]').trigger('click')

    expect(wrapper.get('[data-test="analytics-report-settings-error"]').text()).toContain('status unavailable')
    expect(wrapper.get('.settings-panel__save').attributes('disabled')).toBeDefined()
  })

  it('keeps a successful save visible when refreshing the status fails', async () => {
    reportApi.update.mockResolvedValue({ data: {}, meta: {} })
    reportApi.refresh.mockRejectedValueOnce(new Error('status refresh failed'))
    const wrapper = mount(SettingsView, { global: { stubs: { SettingsDomainPanel: true, SettingsSecurityView: true, SettingsMediaForm: true, IntegrationCenter: true } } })

    await wrapper.get('[data-test="settings-tab-analytics"]').trigger('click')
    await wrapper.get('[data-test="analytics-report-settings"] form').trigger('submit')
    await flushPromises()

    expect(reportApi.update).toHaveBeenCalledWith({
      enabled: true, schedule: 'daily', timeOfDay: '03:00', timezone: 'UTC', dayOfWeek: 'mon'
    })
    expect(wrapper.get('[data-test="analytics-report-settings-message"]').text()).toContain('已保存')
    expect(wrapper.get('[data-test="analytics-report-settings-refresh-warning"]').text()).toContain('设置已保存')
    expect(wrapper.find('[data-test="analytics-report-settings-save-error"]').exists()).toBe(false)
    expect(wrapper.get('.settings-panel__save').attributes('disabled')).toBeUndefined()
  })

  it('shows calendar controls only for daily and weekly schedules', async () => {
    const wrapper = mount(SettingsView, { global: { stubs: {
      SettingsDomainPanel: true, SettingsSecurityView: true, SettingsMediaForm: true, IntegrationCenter: true
    } } })
    await wrapper.get('[data-test="settings-tab-analytics"]').trigger('click')

    expect(wrapper.find('[data-test="analytics-report-time"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="analytics-report-timezone"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="analytics-report-weekday"]').exists()).toBe(false)

    await wrapper.get('[data-test="analytics-report-schedule"]').setValue('weekly')
    expect(wrapper.find('[data-test="analytics-report-weekday"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="analytics-report-time"]').exists()).toBe(true)

    await wrapper.get('[data-test="analytics-report-schedule"]').setValue('every6Hours')
    expect(wrapper.find('[data-test="analytics-report-weekday"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="analytics-report-time"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="analytics-report-timezone"]').exists()).toBe(false)
  })

  it('submits the selected weekly weekday, time, and timezone', async () => {
    reportApi.update.mockResolvedValue({ data: {}, meta: {} })
    reportApi.data = { data: {
      enabled: true, schedule: 'weekly', timeOfDay: '05:30', timezone: 'Asia/Shanghai', dayOfWeek: 'wed',
      lastSuccessAt: null, lastError: null
    } }
    const wrapper = mount(SettingsView, { global: { stubs: {
      SettingsDomainPanel: true, SettingsSecurityView: true, SettingsMediaForm: true, IntegrationCenter: true
    } } })
    await wrapper.get('[data-test="settings-tab-analytics"]').trigger('click')
    await wrapper.get('[data-test="analytics-report-weekday"]').setValue('fri')
    await wrapper.get('[data-test="analytics-report-settings"] form').trigger('submit')
    await flushPromises()

    expect(reportApi.update).toHaveBeenCalledWith({
      enabled: true,
      schedule: 'weekly',
      timeOfDay: '05:30',
      timezone: 'Asia/Shanghai',
      dayOfWeek: 'fri'
    })
  })
})
