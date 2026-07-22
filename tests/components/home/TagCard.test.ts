import { mount } from '@vue/test-utils'
import TagCard from '../../../components/home/TagCard.vue'
import type { TagView } from '../../../types/public-view'

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

const tags: TagView[] = Array.from({ length: 5 }, (_, index) => ({
  slug: `t${index}`,
  name: `Tag${index}`
}))

describe('TagCard', () => {
  it('collapses to collapsedCount and expands on toggle', async () => {
    const wrapper = mount(TagCard, {
      props: { tags, collapsedCount: 2 },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.findAll('.tag-card__tag')).toHaveLength(2)

    await wrapper.find('.tag-card__toggle').trigger('click')
    expect(wrapper.findAll('.tag-card__tag')).toHaveLength(5)

    await wrapper.find('.tag-card__toggle').trigger('click')
    expect(wrapper.findAll('.tag-card__tag')).toHaveLength(2)
  })

  it('shows no toggle when tags fit within collapsedCount', () => {
    const wrapper = mount(TagCard, {
      props: { tags: tags.slice(0, 2), collapsedCount: 12 },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.find('.tag-card__toggle').exists()).toBe(false)
    expect(wrapper.findAll('.tag-card__tag')).toHaveLength(2)
  })
})
