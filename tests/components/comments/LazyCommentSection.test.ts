import { flushPromises, mount } from '@vue/test-utils'
import { shallowRef } from 'vue'
import LazyCommentSection from '../../../components/comments/LazyCommentSection.vue'

const api = vi.hoisted(() => ({
  usePostComments: vi.fn(),
  submitComment: vi.fn()
}))

vi.mock('~/composables/usePublicApi', () => api)

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  readonly root = null
  readonly rootMargin = '600px 0px'
  readonly thresholds = [0]
  observed: Element[] = []

  constructor(readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this)
  }

  observe(target: Element) {
    this.observed.push(target)
  }

  unobserve(target: Element) {
    this.observed = this.observed.filter((item) => item !== target)
  }

  disconnect() {
    this.observed = []
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  reveal(target: Element) {
    this.callback([
      { isIntersecting: true, target } as unknown as IntersectionObserverEntry
    ], this as unknown as IntersectionObserver)
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  FakeIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  api.usePostComments.mockReturnValue({
    data: shallowRef({ data: [], meta: {} }),
    pending: shallowRef(false),
    error: shallowRef(null),
    refresh: vi.fn()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LazyCommentSection', () => {
  it('loads the comment bundle only when the section approaches the viewport', async () => {
    const wrapper = mount(LazyCommentSection, {
      props: { slug: 'post-one', turnstileSiteKey: null }
    })

    expect(wrapper.find('.comment-section').exists()).toBe(false)
    expect(api.usePostComments).not.toHaveBeenCalled()

    const observer = FakeIntersectionObserver.instances[0]
    const host = wrapper.get('[data-test="lazy-comment-section"]').element
    observer?.reveal(host)
    await flushPromises()

    await vi.waitFor(() => {
      expect(wrapper.find('.comment-section').exists()).toBe(true)
      expect(api.usePostComments).toHaveBeenCalledOnce()
    })
  })
})
