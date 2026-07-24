import {
  CommentModerationProviderError,
  type CommentModerationInput
} from '../../../server/providers/comment-moderation/comment-moderation-provider'
import {
  applyProxyBaseUrl,
  createHttpCommentModerationProvider,
  deriveOpenAiCompatibleModelsUrl,
  extractJsonObject,
  listOpenAiCompatibleModels,
  OPENAI_COMPAT_MODERATION_SYSTEM_PROMPT
} from '../../../server/providers/comment-moderation/http-comment-moderation-provider'

const input: CommentModerationInput = {
  nickname: 'Reader',
  content: 'A thoughtful comment',
  locale: 'zh-CN',
  post: { id: 'post-1', title: 'Published article' }
}

function chatResponse(content: string, overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: 'chatcmpl-1',
      model: 'provider-model-revision',
      choices: [{ message: { role: 'assistant', content } }],
      ...overrides
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

describe('HTTP OpenAI-compatible comment moderation provider', () => {
  it('calls chat/completions with a fixed system prompt and maps JSON allow decisions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      chatResponse(JSON.stringify({
        decision: 'allow',
        confidence: 0.97,
        categories: [],
        reasons: [],
        ignored: true
      }))
    )
    const provider = createHttpCommentModerationProvider({
      endpoint: 'https://llm.example.com/v1/chat/completions',
      apiKey: 'secret-key',
      model: 'safe-model',
      fetchImpl
    })

    await expect(provider.moderate(input)).resolves.toEqual({
      decision: 'allow',
      confidence: 0.97,
      categories: [],
      reasons: [],
      providerRequestId: 'chatcmpl-1',
      modelVersion: 'provider-model-revision'
    })

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://llm.example.com/v1/chat/completions')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    expect(init.headers).toMatchObject({
      authorization: 'Bearer secret-key',
      'content-type': 'application/json'
    })
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({
      model: 'safe-model',
      temperature: 0,
      stream: false,
      max_tokens: 300,
      messages: [
        { role: 'system', content: OPENAI_COMPAT_MODERATION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            'Nickname: Reader',
            'Locale: zh-CN',
            'Post ID: post-1',
            'Post title: Published article',
            'Comment:\nA thoughtful comment'
          ].join('\n')
        }
      ]
    })
    expect(String(init.body)).not.toContain('email')
    expect(String(init.body)).not.toContain('visitor')
  })

  it('accepts fenced JSON content and maps reject decisions', async () => {
    const provider = createHttpCommentModerationProvider({
      endpoint: 'https://llm.example.com/v1/chat/completions',
      apiKey: 'secret-key',
      model: 'safe-model',
      fetchImpl: vi.fn().mockResolvedValue(
        chatResponse([
          '```json',
          JSON.stringify({ decision: 'reject', confidence: 0.95, categories: ['spam'], reasons: ['Promotional'] }),
          '```'
        ].join('\n'))
      )
    })

    await expect(provider.moderate(input)).resolves.toEqual({
      decision: 'reject',
      confidence: 0.95,
      categories: ['spam'],
      reasons: ['Promotional'],
      providerRequestId: 'chatcmpl-1',
      modelVersion: 'provider-model-revision'
    })
  })

  it('falls back to the configured model id when the envelope omits model', async () => {
    const provider = createHttpCommentModerationProvider({
      endpoint: 'https://llm.example.com/v1/chat/completions',
      apiKey: 'secret-key',
      model: 'configured-model',
      fetchImpl: vi.fn().mockResolvedValue(
        chatResponse(JSON.stringify({ decision: 'allow', confidence: 0.91 }), {
          id: undefined,
          model: undefined
        })
      )
    })

    await expect(provider.moderate(input)).resolves.toMatchObject({
      decision: 'allow',
      confidence: 0.91,
      providerRequestId: null,
      modelVersion: 'configured-model'
    })
  })

  it.each([
    ['network failure', vi.fn().mockRejectedValue(new Error('private network details'))],
    ['non-success response', vi.fn().mockResolvedValue(new Response('denied', { status: 503 }))],
    ['invalid JSON envelope', vi.fn().mockResolvedValue(new Response('{bad', { status: 200 }))],
    [
      'missing choices',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 }))
    ],
    [
      'invalid decision payload',
      vi.fn().mockResolvedValue(chatResponse(JSON.stringify({ decision: 'review' })))
    ],
    [
      'non-json assistant content',
      vi.fn().mockResolvedValue(chatResponse('I think this is fine'))
    ]
  ])('fails closed on %s', async (_label, fetchImpl) => {
    const provider = createHttpCommentModerationProvider({
      endpoint: 'https://llm.example.com/v1/chat/completions',
      apiKey: 'secret-key',
      model: 'safe-model',
      fetchImpl
    })

    const error = await provider.moderate(input).catch((caught) => caught)
    expect(error).toEqual(expect.objectContaining({ name: 'CommentModerationProviderError' }))
    expect(error.message).not.toContain('private network details')
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
      endpoint: 'https://llm.example.com/v1/chat/completions',
      apiKey: 'secret-key',
      model: 'safe-model',
      fetchImpl: vi.fn().mockResolvedValue(new Response(body, { status: 200 }))
    })

    await expect(provider.moderate(input)).rejects.toBeInstanceOf(CommentModerationProviderError)
    expect(cancelled).toBe(true)
  })

  it('extracts a JSON object from noisy assistant prose', () => {
    expect(extractJsonObject('Sure.\n{"decision":"allow","confidence":0.9}\nThanks'))
      .toBe('{"decision":"allow","confidence":0.9}')
  })

  it('derives the OpenAI-compatible models URL from a chat completions endpoint', () => {
    expect(deriveOpenAiCompatibleModelsUrl('https://llm.example.com/v1/chat/completions'))
      .toBe('https://llm.example.com/v1/models')
    expect(deriveOpenAiCompatibleModelsUrl('https://openrouter.ai/api/v1/chat/completions?x=1'))
      .toBe('https://openrouter.ai/api/v1/models')
  })

  it('rewrites chat and models URLs through an optional reverse-proxy base', () => {
    expect(applyProxyBaseUrl(
      'https://windhub.cc/v1/chat/completions',
      'https://bridge.example.com'
    )).toBe('https://bridge.example.com/v1/chat/completions')
    expect(applyProxyBaseUrl(
      'https://windhub.cc/v1/models',
      'https://bridge.example.com/openai/'
    )).toBe('https://bridge.example.com/openai/v1/models')
    expect(applyProxyBaseUrl('https://windhub.cc/v1/models', null))
      .toBe('https://windhub.cc/v1/models')
  })

  it('sends chat completions through the proxy base when configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      chatResponse(JSON.stringify({ decision: 'allow', confidence: 0.91 }))
    )
    const provider = createHttpCommentModerationProvider({
      endpoint: 'https://windhub.cc/v1/chat/completions',
      apiKey: 'secret-key',
      model: 'safe-model',
      proxyBaseUrl: 'https://bridge.example.com',
      fetchImpl
    })

    await provider.moderate(input)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://bridge.example.com/v1/chat/completions')
  })

  it('lists models through the proxy base when configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: 'm1' }]
    }), { status: 200 }))

    await listOpenAiCompatibleModels({
      endpoint: 'https://windhub.cc/v1/chat/completions',
      apiKey: 'secret-key',
      proxyBaseUrl: 'https://bridge.example.com',
      fetchImpl
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://bridge.example.com/v1/models',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('lists sorted unique model ids from GET /v1/models', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: 'zeta' },
        { id: 'alpha' },
        { id: 'alpha' },
        { object: 'model' }
      ]
    }), { status: 200 }))

    await expect(listOpenAiCompatibleModels({
      endpoint: 'https://llm.example.com/v1/chat/completions',
      apiKey: 'secret-key',
      fetchImpl
    })).resolves.toEqual(['alpha', 'zeta'])

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://llm.example.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer secret-key' })
      })
    )
  })
})
