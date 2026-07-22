import { mount } from '@vue/test-utils'
import DashboardMetricCard from '../../../components/admin/DashboardMetricCard.vue'

describe('DashboardMetricCard', () => {
  it('renders the label and value', () => {
    const wrapper = mount(DashboardMetricCard, { props: { label: 'Drafts', value: 7 } })

    expect(wrapper.find('.metric-card__label').text()).toBe('Drafts')
    expect(wrapper.find('.metric-card__value').text()).toBe('7')
  })

  it('renders a zero value', () => {
    const wrapper = mount(DashboardMetricCard, { props: { label: 'Tags', value: 0 } })

    expect(wrapper.find('.metric-card__value').text()).toBe('0')
  })
})
