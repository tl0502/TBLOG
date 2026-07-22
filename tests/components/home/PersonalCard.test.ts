import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import PersonalCard from '../../../components/home/PersonalCard.vue'

describe('PersonalCard', () => {
  it('toggles the public profile preview when no static preview state is provided', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PersonalCard)
    const toggle = wrapper.get('.personal-card__hint')

    expect(wrapper.get('.personal-anchor').attributes('data-preview')).toBe('false')

    await toggle.trigger('click')
    vi.advanceTimersByTime(160)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.personal-anchor').attributes('data-preview')).toBe('true')

    await toggle.trigger('click')
    vi.advanceTimersByTime(160)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.personal-anchor').attributes('data-preview')).toBe('false')

    wrapper.unmount()
    vi.useRealTimers()
  })
})
