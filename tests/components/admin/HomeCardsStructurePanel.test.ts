import { mount } from '@vue/test-utils'
import HomeCardsStructurePanel from '../../../components/admin/HomeCardsStructurePanel.vue'
import type { HomeRailCard } from '../../../types/settings'

const cards: HomeRailCard[] = [
  { instanceId: 'tags-1', type: 'tags', enabled: true, size: 'normal', title: 'Tags', collapsedCount: 12 },
  { instanceId: 'build-1', type: 'build-log', enabled: true, size: 'normal', title: 'Build Log', entries: [] }
]

describe('HomeCardsStructurePanel', () => {
  it('offers only unused registered types and emits add, move, remove, and save actions', async () => {
    const wrapper = mount(HomeCardsStructurePanel, { props: { cards } })

    expect(wrapper.findAll('option[value="tags"]')).toHaveLength(1)
    await wrapper.get('[data-test="home-card-library-select"]').setValue('tags')
    await wrapper.get('[data-test="home-card-library-add"]').trigger('click')
    await wrapper.get('[data-test="home-card-order-build-1"]').findAll('button')[0]!.trigger('click')
    await wrapper.get('[data-test="home-card-order-tags-1"]').findAll('button')[2]!.trigger('click')
    await wrapper.get('[data-test="home-card-structure-save"]').trigger('click')

    expect(wrapper.emitted('add')).toEqual([['tags']])
    expect(wrapper.emitted('move')).toEqual([[1, 0]])
    expect(wrapper.emitted('remove')).toEqual([['tags-1']])
    expect(wrapper.emitted('save')).toHaveLength(1)
  })
})
