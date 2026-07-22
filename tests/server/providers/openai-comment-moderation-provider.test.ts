import {
  CommentModerationProviderError,
  type CommentModerationInput
} from '../../../server/providers/comment-moderation/comment-moderation-provider'
import {
  createOpenAiCommentModerationProvider,
  DEFAULT_OPENAI_MODERATION_MODEL,
  OPENAI_MODERATION_ENDPOINT
} from '../../../server/providers/comment-moderation/openai-comment-moderation-provider'

const input: CommentModerationInput = {
  nickname: 'Reader',
  content: 'A thoughtful comment',
  locale: 'zh-CN',
  post: { id: 'post-1', title: 'Published article' }
}

function moderationResponse(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    id: 'modr-request-1',
    model: 'omni-moderation-latest-2026-01-01',
    results: [{
      flagged: false,
      categories: { harassment: false, violence: false },
      category_scores: { harassment: 0.02, violence: 0.08 }
    }],
    ...overrides
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('OpenAI comment moderation provider', () => {
  it('sends only the bounded moderation fields and keeps an unflagged result for manual review', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(moderationResponse())
    const provider = createOpenAiCommentModerationProvider({ apiKey: 'openai-secret', fetchImpl })

    const result = await provider.moderate(input)

    expect(result).toMatchObject({
      decision: 'allow',
      confidence: null,
      categories: [],
      reasons: [],
      providerRequestId: 'modr-request-1',
      modelVersion: 'omni-moderation-latest-2026-01-01'
    })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(OPENAI_MODERATION_ENDPOINT)
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    expect(init.headers).toMatchObject({
      authorization: 'Bearer openai-secret',
      'content-type': 'application/json'
    })
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe(DEFAULT_OPENAI_MODERATION_MODEL)
    expect(body.input).toContain('Nickname: Reader')
    expect(body.input).toContain('Locale: zh-CN')
    expect(body.input).toContain('Post ID: post-1')
    expect(body.input).toContain('Post title: Published article')
    expect(body.input).toContain('Comment:\nA thoughtful comment')
    expect(String(init.body)).not.toContain('email')
    expect(String(init.body)).not.toContain('visitor')
  })

  it('maps flagged categories and their highest score to a reject result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(moderationResponse({
      results: [{
        flagged: true,
        categories: { harassment: true, violence: false, 'violence/graphic': true },
        category_scores: { harassment: 0.93, violence: 0.12, 'violence/graphic': 0.98 }
      }]
    }))
    const provider = createOpenAiCommentModerationProvider({ apiKey: 'openai-secret', fetchImpl })

    await expect(provider.moderate(input)).resolves.toEqual({
      decision: 'reject',
      confidence: 0.98,
      categories: ['harassment', 'violence/graphic'],
      reasons: [
        'OpenAI moderation flagged category: harassment',
        'OpenAI moderation flagged category: violence/graphic'
      ],
      providerRequestId: 'modr-request-1',
      modelVersion: 'omni-moderation-latest-2026-01-01'
    })
  })

  it.each([
    ['network failure', vi.fn().mockRejectedValue(new Error('private provider details'))],
    ['non-success response', vi.fn().mockResolvedValue(new Response('denied', { status: 401 }))],
    ['invalid JSON', vi.fn().mockResolvedValue(new Response('{bad', { status: 200 }))],
    ['missing scores', vi.fn().mockResolvedValue(moderationResponse({
      results: [{ flagged: false, categories: {}, category_scores: {} }]
    }))],
    ['inconsistent flag', vi.fn().mockResolvedValue(moderationResponse({
      results: [{
        flagged: true,
        categories: { harassment: false },
        category_scores: { harassment: 0.99 }
      }]
    }))]
  ])('fails closed on %s', async (_label, fetchImpl) => {
    const provider = createOpenAiCommentModerationProvider({
      apiKey: 'openai-secret',
      fetchImpl
    })

    const error = await provider.moderate(input).catch((caught) => caught)
    expect(error).toBeInstanceOf(CommentModerationProviderError)
    expect(error.message).not.toContain('private provider details')
  })

  it('rejects a response whose declared size exceeds the moderation response budget', async () => {
    const provider = createOpenAiCommentModerationProvider({
      apiKey: 'openai-secret',
      fetchImpl: vi.fn().mockResolvedValue(new Response('{}', {
        status: 200,
        headers: { 'content-length': '65537' }
      }))
    })

    await expect(provider.moderate(input)).rejects.toBeInstanceOf(CommentModerationProviderError)
  })
})
