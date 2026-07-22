import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { shallowRef } from 'vue'
import CommentSection from '../../../components/comments/CommentSection.vue'
import type { Envelope, SubmitCommentBody } from '../../../composables/usePublicApi'
import type { PublicCommentView } from '../../../types/public-view'

const api = vi.hoisted(() => ({
  usePostComments: vi.fn(),
  fetchPostComments: vi.fn(),
  submitComment: vi.fn()
}))

vi.mock('~/composables/usePublicApi', () => api)

const approvedComments: PublicCommentView[] = [
  {
    id: 'comment-1',
    nickname: 'Reader',
    content: 'A useful article.',
    createdAt: '2026-07-01T00:00:00.000Z',
    replies: []
  }
]

function publicCommentsResult(options: {
  data?: Envelope<PublicCommentView[]> | null
  pending?: boolean
  error?: Error | null
} = {}) {
  return {
    data: shallowRef(options.data ?? { data: approvedComments, meta: {} }),
    pending: shallowRef(options.pending ?? false),
    error: shallowRef(options.error ?? null),
    refresh: vi.fn().mockResolvedValue(undefined)
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function fillAndSubmit(wrapper: VueWrapper) {
  if (!wrapper.find('form').exists()) await wrapper.get('.comment-section__compose-trigger').trigger('click')
  await wrapper.get('[data-test="comment-nickname"]').setValue('Reader')
  await wrapper.get('[data-test="comment-email"]').setValue('reader@example.com')
  await wrapper.get('[data-test="comment-content"]').setValue('A thoughtful note.')
  await wrapper.get('form').trigger('submit')
}

beforeEach(() => {
  vi.resetAllMocks()
  api.usePostComments.mockReturnValue(publicCommentsResult())
})

describe('CommentSection', () => {
  it('shows a loading state while approved comments are loading', () => {
    api.usePostComments.mockReturnValue(publicCommentsResult({ data: null, pending: true }))

    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })

    expect(wrapper.text()).toContain('正在加载评论')
    expect(api.usePostComments).toHaveBeenCalledWith(expect.anything(), { limit: 20 })
  })

  it('appends the next bounded comment page without duplicates', async () => {
    api.usePostComments.mockReturnValue(publicCommentsResult({
      data: { data: approvedComments, meta: { nextCursor: 'cursor-2' } }
    }))
    api.fetchPostComments.mockResolvedValue({
      data: [
        approvedComments[0],
        { id: 'comment-2', nickname: 'Next reader', content: 'Next page', createdAt: '2026-07-03T00:00:00.000Z', replies: [] }
      ],
      meta: { nextCursor: null }
    })
    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })

    await wrapper.get('.comment-section__pagination button').trigger('click')
    await flushPromises()

    expect(api.fetchPostComments).toHaveBeenCalledWith('post-one', { cursor: 'cursor-2', limit: 20 })
    expect(wrapper.text()).toContain('Next reader')
    expect(wrapper.findAll('.comment-list__item')).toHaveLength(2)
    expect(wrapper.find('.comment-section__pagination').exists()).toBe(false)
  })

  it('shows a read error without hiding the visitor form', () => {
    api.usePostComments.mockReturnValue(publicCommentsResult({ data: null, error: new Error('offline') }))

    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })

    expect(wrapper.text()).toContain('评论加载失败')
    expect(wrapper.find('.comment-section__compose-trigger').exists()).toBe(true)
  })

  it('renders approved comment data from the public API', () => {
    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })

    expect(wrapper.text()).toContain('Reader')
    expect(wrapper.text()).toContain('A useful article.')
    expect(wrapper.get('.comment-section__count').text()).toBe('1')
  })

  it('opens a contextual reply form and submits the top-level parent id', async () => {
    api.submitComment.mockResolvedValue({ data: { id: 'reply-new', status: 'pending' }, meta: {} })
    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })
    await wrapper.get('.comment-list__reply').trigger('click')
    expect(wrapper.text()).toContain('回复 @Reader')
    await fillAndSubmit(wrapper)
    await flushPromises()
    expect(api.submitComment).toHaveBeenCalledWith('post-one', expect.objectContaining({ parentCommentId: 'comment-1' }))
  })

  it('counts replies and preserves the clicked reply nickname while submitting the root id', async () => {
    api.usePostComments.mockReturnValue(publicCommentsResult({ data: { data: [{
      ...approvedComments[0]!,
      replies: [{ id: 'reply-1', parentCommentId: 'comment-1', replyToNickname: 'First reader', nickname: 'Second reader', content: 'Nested', createdAt: '2026-07-02T00:00:00.000Z' }]
    }], meta: {} } }))
    api.submitComment.mockResolvedValue({ data: { id: 'reply-new', status: 'pending' }, meta: {} })
    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })
    expect(wrapper.get('.comment-section__count').text()).toBe('2')
    await wrapper.get('.comment-list__replies .comment-list__reply').trigger('click')
    expect(wrapper.text()).toContain('回复 @Second reader')
    await fillAndSubmit(wrapper)
    expect(api.submitComment).toHaveBeenCalledWith('post-one', expect.objectContaining({ parentCommentId: 'reply-1' }))
  })

  it('submits the exact slug and body, shows moderation feedback, and remounts the real form', async () => {
    const body: SubmitCommentBody = {
      nickname: 'Reader',
      email: 'reader@example.com',
      content: 'A thoughtful note.'
    }
    api.submitComment.mockResolvedValue({ data: { id: 'pending-1', status: 'pending' }, meta: {} })
    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })
    await wrapper.get('.comment-section__compose-trigger').trigger('click')

    await fillAndSubmit(wrapper)
    await flushPromises()

    expect(api.submitComment).toHaveBeenCalledWith('post-one', body)
    expect(wrapper.text()).toContain('等待审核')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('preserves the visitor inputs and shows an error after a failed submit', async () => {
    api.submitComment.mockRejectedValue(new Error('network failure'))
    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })

    await fillAndSubmit(wrapper)
    await flushPromises()

    expect(wrapper.text()).toContain('评论提交失败')
    expect(wrapper.get<HTMLInputElement>('[data-test="comment-nickname"]').element.value).toBe('Reader')
    expect(wrapper.get<HTMLInputElement>('[data-test="comment-email"]').element.value).toBe('reader@example.com')
    expect(wrapper.get<HTMLTextAreaElement>('[data-test="comment-content"]').element.value).toBe('A thoughtful note.')
  })

  it('refreshes public comments after an automatic approval', async () => {
    const result = publicCommentsResult()
    api.usePostComments.mockReturnValue(result)
    api.submitComment.mockResolvedValue({ data: { id: 'approved-1', status: 'approved' }, meta: {} })
    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })

    await fillAndSubmit(wrapper)
    await flushPromises()

    expect(wrapper.text()).toContain('已通过自动审核')
    expect(result.refresh).toHaveBeenCalledOnce()
  })

  it('shows the automatic rejection result without refreshing public comments', async () => {
    const result = publicCommentsResult()
    api.usePostComments.mockReturnValue(result)
    api.submitComment.mockResolvedValue({ data: { id: 'rejected-1', status: 'rejected' }, meta: {} })
    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })

    await fillAndSubmit(wrapper)
    await flushPromises()

    expect(wrapper.text()).toContain('未通过自动审核')
    expect(result.refresh).not.toHaveBeenCalled()
  })

  it('clears failed-submit state and resets the form when the article slug changes', async () => {
    api.submitComment.mockRejectedValue(new Error('network failure'))
    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })

    await fillAndSubmit(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('评论提交失败')

    await wrapper.setProps({ slug: 'post-two' })

    expect(wrapper.text()).not.toContain('评论提交失败')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('clears success feedback when the article slug changes', async () => {
    api.submitComment.mockResolvedValue({ data: { id: 'pending-1', status: 'pending' }, meta: {} })
    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })

    await fillAndSubmit(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('等待审核')

    await wrapper.setProps({ slug: 'post-two' })

    expect(wrapper.text()).not.toContain('等待审核')
  })

  it('disables submission and prevents a second request while one is pending', async () => {
    const request = deferred<Envelope<{ id: string; status: 'pending' }>>()
    api.submitComment.mockReturnValue(request.promise)
    const wrapper = mount(CommentSection, { props: { slug: 'post-one' } })

    await fillAndSubmit(wrapper)
    await wrapper.get('form').trigger('submit')

    expect(api.submitComment).toHaveBeenCalledTimes(1)
    expect(wrapper.get<HTMLButtonElement>('[data-test="comment-submit"]').element.disabled).toBe(true)

    request.resolve({ data: { id: 'pending-1', status: 'pending' }, meta: {} })
    await flushPromises()
  })
})
