import { mount } from '@vue/test-utils'
import SettingsCommentForm from '../../../components/admin/SettingsCommentForm.vue'
import type { CommentSettings } from '../../../types/settings'

function value(): CommentSettings {
  return {
    enabled: true,
    autoModerationEnabled: true,
    turnstileSiteKey: null,
    rateLimit: { windowSeconds: null, maxPerWindow: null }
  }
}

describe('SettingsCommentForm', () => {
  it('clears automatic moderation when comments are disabled', async () => {
    const settings = value()
    const wrapper = mount(SettingsCommentForm, { props: { value: settings, issues: [] } })

    await wrapper.get('[data-test="comment-enabled"]').setValue(false)

    expect(settings.enabled).toBe(false)
    expect(settings.autoModerationEnabled).toBe(false)
    expect(wrapper.get('[data-test="comment-auto-moderation"]').attributes('disabled')).toBeDefined()
  })
})
