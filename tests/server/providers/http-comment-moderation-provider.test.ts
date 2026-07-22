import {
  CommentModerationProviderError,
  type CommentModerationInput
} from '../../../server/providers/comment-moderation/comment-moderation-provider'
import { createHttpCommentModerationProvider } from '../../../server/providers/comment-moderation/http-comment-moderation-provider'

const input: CommentModerationInput = {
  nickname: 'Reader',
  content: 'A thoughtful comment',
  locale: 'zh-CN',
  post: { id: 'post-1', title: 'Published article' }
}

describe('HTTP comment moderation provider', () => {
  it('sends the fixed privacy-bounded protocol and normalizes an allow response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          decision: 'allow',
          confidence: 0.97,
          categories: [],
          reasons: [],
          requestId: 'request-1',
          modelVersion: 'model-2',
          ignoredProviderField: 'not retained'
        }),
        { status: 200 }
      )
    )
    const provider = createHttpCommentModerationProvider({
      endpoint: 'https://moderation.example.com/v1/comments',
      apiKey: 'secret-key',
      model: 'safe-model',
      fetchImpl
    })

    await expect(provider.moderate(input)).resolves.toEqual({
      decision: 'allow',
      confidence: 0.97,
      categories: [],
      reasons: [],
      providerRequestId: 'request-1',
      modelVersion: 'model-2'
    })

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://moderation.example.com/v1/comments')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    expect(init.headers).toMatchObject({
      authorization: 'Bearer secret-key',
      'content-type': 'application/json'
    })
    expect(JSON.parse(String(init.body))).toEqual({
      version: '1',
      model: 'safe-model',
      moderatedFields: ['nickname', 'content'],
      comment: {
        nickname: 'Reader',
        content: 'A thoughtful comment',
        locale: 'zh-CN'
      },
      post: { id: 'post-1', title: 'Published article' }
    })
    expect(String(init.body)).not.toContain('email')
    expect(String(init.body)).not.toContain('visitor')
  })

  it('normalizes a reject response', async () => {
    const provider = createHttpCommentModerationProvider({
      endpoint: 'https://moderation.example.com/v1/comments',
      apiKey: 'secret-key',
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ decision: 'reject', categories: ['spam'], reasons: ['Promotional'] }),
          { status: 200 }
        )
      )
    })

    await expect(provider.moderate(input)).resolves.toMatchObject({
      decision: 'reject',
      categories: ['spam'],
      reasons: ['Promotional']
    })
  })

  it.each([
    ['network failure', vi.fn().mockRejectedValue(new Error('private network details'))],
    ['non-success response', vi.fn().mockResolvedValue(new Response('denied', { status: 503 }))],
    ['invalid JSON', vi.fn().mockResolvedValue(new Response('{bad', { status: 200 }))],
    [
      'invalid decision',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ decision: 'review' }), { status: 200 }))
    ]
  ])('fails closed on %s', async (_label, fetchImpl) => {
    const provider = createHttpCommentModerationProvider({
      endpoint: 'https://moderation.example.com/v1/comments',
      apiKey: 'secret-key',
      fetchImpl
    })

    const error = await provider.moderate(input).catch((caught) => caught)
    expect(error).toEqual(expect.objectContaining({ name: 'CommentModerationProviderError' }))
    expect(error.message).not.toContain('private network details')
  })

  it('uses the typed unavailable error for the unconfigured-safe path', async () => {
    const provider = createHttpCommentModerationProvider({
      endpoint: 'https://moderation.example.com/v1/comments',
      apiKey: 'secret-key',
      fetchImpl: vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    })

    await expect(provider.moderate(input)).rejects.toBeInstanceOf(CommentModerationProviderError)
  })

  it('aborts a streamed response as soon as it exceeds the response budget', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(65_000))
        controller.enqueue(new Uint8Array(1_000))
      },
      cancel() {
        cancelled = true
      }
    })
    const provider = createHttpCommentModerationProvider({
      endpoint: 'https://moderation.example.com/v1/comments',
      apiKey: 'secret-key',
      fetchImpl: vi.fn().mockResolvedValue(new Response(body, { status: 200 }))
    })

    await expect(provider.moderate(input)).rejects.toBeInstanceOf(CommentModerationProviderError)
    expect(cancelled).toBe(true)
  })
})
