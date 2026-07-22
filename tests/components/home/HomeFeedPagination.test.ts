import { mount } from '@vue/test-utils'
import HomeFeedPagination from '../../../components/home/HomeFeedPagination.vue'

const NuxtLink = {
  name: 'NuxtLink',
  props: ['to'],
  template: '<a><slot /></a>'
}

describe('HomeFeedPagination', () => {
  it('renders bounded page numbers and previous/next links', () => {
    const wrapper = mount(HomeFeedPagination, {
      props: { page: 5, pageCount: 10, sort: 'updatedAt', order: 'asc' },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.find('.home-feed-pagination__pages').text()).toContain('1…456…10')
    const links = wrapper.findAllComponents(NuxtLink)
    expect(links[0].props('to')).toEqual({
      path: '/', query: { sort: 'updatedAt', order: 'asc', page: '4' }, hash: '#articles'
    })
    expect(links.at(-1)?.props('to')).toEqual({
      path: '/', query: { sort: 'updatedAt', order: 'asc', page: '6' }, hash: '#articles'
    })
  })

  it('hides pagination when all articles fit on one page', () => {
    const wrapper = mount(HomeFeedPagination, {
      props: { page: 1, pageCount: 1, sort: 'publishedAt', order: 'desc' },
      global: { stubs: { NuxtLink } }
    })

    expect(wrapper.find('.home-feed-pagination').exists()).toBe(false)
  })
})
