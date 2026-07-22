import { mount } from '@vue/test-utils'
import SettingsHomeForm from '../../../components/admin/SettingsHomeForm.vue'
import type { HomeSettings } from '../../../types/settings'

function value(): HomeSettings {
  return {
    railCards: [
      { instanceId: 'tags-1', type: 'tags', enabled: true, size: 'normal', title: 'Tags', collapsedCount: 12 },
      { instanceId: 'build-1', type: 'build-log', enabled: true, size: 'normal', title: 'Build Log', entries: ['One'] }
    ]
  }
}

describe('SettingsHomeForm', () => {
  it('edits extension cards without representing the personal card or local ordering controls', () => {
    const settings = value()
    const wrapper = mount(SettingsHomeForm, { props: { value: settings, issues: [] } })

    expect(wrapper.text()).toContain('个人卡固定显示在最上方')
    expect(wrapper.find('[data-test="home-card-personal"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="home-card-tags-1"]').text()).not.toContain('上移')
  })

  it('edits build log entries', async () => {
    const settings = value()
    const wrapper = mount(SettingsHomeForm, { props: { value: settings, issues: [] } })

    await wrapper.get('[data-test="build-log-entry-0"]').setValue('Updated')

    expect(settings.railCards[1]).toMatchObject({ entries: ['Updated'] })
  })

  it('offers independent save and right-drawer preview actions for each card', async () => {
    const settings = value()
    const wrapper = mount(SettingsHomeForm, { props: { value: settings, issues: [] } })

    await wrapper.get('[data-test="home-card-preview-tags-1"]').trigger('click')
    expect(wrapper.emitted('previewCard')).toEqual([['tags-1']])

    await wrapper.get('[data-test="home-card-save-tags-1"]').trigger('click')
    expect(wrapper.emitted('saveCard')).toEqual([['tags-1']])
  })
})
