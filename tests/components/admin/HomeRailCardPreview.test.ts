import { mount } from '@vue/test-utils'
import HomeRailCardPreview from '../../../components/admin/HomeRailCardPreview.vue'

describe('HomeRailCardPreview', () => {
  it('maps the current rhythm and activity configuration into representative preview data', () => {
    const wrapper = mount(HomeRailCardPreview, {
      props: { card: {
        instanceId: 'activity-1', type: 'site-activity', enabled: false, size: 'normal', title: 'Activity',
        limit: 1, includePublished: false, includeUpdated: false,
        manualEntries: [{ date: '2026-07-18T00:00:00.000Z', title: 'Manual', detail: 'Configured', url: null }]
      } },
      global: { stubs: {
        HomeRailCards: { name: 'HomeRailCards', props: ['cards', 'data', 'preview'], template: '<div data-test="rail-preview" />' }
      } }
    })

    const rail = wrapper.getComponent({ name: 'HomeRailCards' })
    expect(rail.props('preview')).not.toBe(false)
    expect(rail.props('data').cards['activity-1'].siteActivity).toEqual([
      expect.objectContaining({ title: 'Manual', source: 'manual' })
    ])
  })

  it('respects site history visibility controls', () => {
    const wrapper = mount(HomeRailCardPreview, {
      props: { card: {
        instanceId: 'history-1', type: 'site-history', enabled: true, size: 'normal', title: 'History',
        startDate: '2025-01-01', showStartDate: false, showLastUpdated: false
      } },
      global: { stubs: { HomeRailCards: { name: 'HomeRailCards', props: ['data'], template: '<div />' } } }
    })

    expect(wrapper.getComponent({ name: 'HomeRailCards' }).props('data').cards['history-1'].siteHistory)
      .toEqual({ startDate: null, daysRunning: 930, lastUpdatedAt: null })
  })
})
