import { shallowRef } from 'vue'
import {
  submitComment,
  usePostComments,
  type Envelope,
  type SubmitCommentBody
} from '../../composables/usePublicApi'

const staleFirst = vi.hoisted(() => ({ use: vi.fn() }))
vi.mock('~/composables/useStaleFirstPublicResource', () => ({
  publicResourceKey: (prefix: string) => prefix,
  useStaleFirstPublicResource: staleFirst.use
}))

describe('public comment API helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    staleFirst.use.mockReset()
  })

  it('loads comments from a reactive URL on the client only', () => {
    const slug = shallowRef('first-post')

    usePostComments(slug)

    expect(staleFirst.use).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ server: false }))
    const url = staleFirst.use.mock.calls[0]?.[0] as () => string
    expect(url()).toBe('/api/v1/posts/first-post/comments')

    slug.value = 'second-post'
    expect(url()).toBe('/api/v1/posts/second-post/comments')
  })

  it('posts the comment body to the slug endpoint and returns the pending envelope', async () => {
    const body: SubmitCommentBody = {
      nickname: 'Reader',
      email: undefined,
      content: 'Plain text only.',
      protectionToken: 'opaque-token'
    }
    const response: Envelope<{ id: string; status: 'pending' }> = {
      data: { id: 'comment-1', status: 'pending' },
      meta: {}
    }
    const request = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('$fetch', request)

    await expect(submitComment('post-one', body)).resolves.toEqual(response)
    expect(request).toHaveBeenCalledWith('/api/v1/posts/post-one/comments', {
      method: 'POST',
      body
    })
  })
})
