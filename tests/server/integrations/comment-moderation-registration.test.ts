import { httpCommentModerationRegistration } from '../../../server/integrations/providers/http-comment-moderation'

function chatAllowResponse(confidence = 0.99) {
  return new Response(JSON.stringify({
    id: 'chatcmpl-health',
    model: 'safe-model',
    choices: [{
      message: {
        content: JSON.stringify({ decision: 'allow', confidence })
      }
    }]
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

function modelsResponse(ids: string[]) {
  return new Response(JSON.stringify({
    data: ids.map((id) => ({ id, object: 'model' }))
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

describe('HTTP OpenAI-compatible comment moderation integration registration', () => {
  it('requires an HTTPS chat completions endpoint and model, and keeps the API key outside stored config', () => {
    const config = httpCommentModerationRegistration.configSchema.parse({
      endpoint: 'https://llm.example.com/v1/chat/completions',
      model: 'safe-model',
      timeoutMs: '4000',
      availableModels: ['safe-model', 'other-model']
    }) as Record<string, unknown>

    expect(httpCommentModerationRegistration.validate(config)).toBeNull()
    expect(httpCommentModerationRegistration.publicProjection(config)).toEqual({
      endpoint: 'https://llm.example.com/v1/chat/completions',
      model: 'safe-model',
      timeoutMs: 4000,
      availableModels: ['safe-model', 'other-model']
    })
    expect(httpCommentModerationRegistration.requiredSecrets).toEqual([
      'COMMENT_MODERATION_API_KEY'
    ])
    expect(httpCommentModerationRegistration.displayName).toBe('OpenAI-Compatible LLM')
    expect(httpCommentModerationRegistration.serverManagedConfigKeys).toEqual(['availableModels'])
    expect(JSON.stringify(config)).not.toContain('apiKey')
  })

  it('exposes detected models as suggestion options on the model field', () => {
    const meta = httpCommentModerationRegistration.resolveFormMeta?.({
      endpoint: 'https://llm.example.com/v1/chat/completions',
      model: 'safe-model',
      availableModels: ['beta-model', 'safe-model']
    })
    const modelField = meta?.find((field) => field.key === 'model')
    expect(modelField?.options).toEqual([
      { value: 'safe-model', label: 'safe-model' },
      { value: 'beta-model', label: 'beta-model' }
    ])
  })

  it('rejects non-HTTPS endpoints', () => {
    const config = httpCommentModerationRegistration.configSchema.parse({
      endpoint: 'http://llm.example.com/v1/chat/completions',
      model: 'safe-model'
    }) as Record<string, unknown>

    expect(httpCommentModerationRegistration.validate(config)).toContain('HTTPS')
  })

  it('rejects endpoints that are not chat completions URLs', () => {
    const config = httpCommentModerationRegistration.configSchema.parse({
      endpoint: 'https://llm.example.com/v1/models',
      model: 'safe-model'
    }) as Record<string, unknown>

    expect(httpCommentModerationRegistration.validate(config)).toContain('chat/completions')
  })

  it('allows saving endpoint without a model so Detect Models can run first', () => {
    const config = httpCommentModerationRegistration.configSchema.parse({
      endpoint: 'https://llm.example.com/v1/chat/completions',
      timeoutMs: '5000'
    }) as Record<string, unknown>

    expect(config.model).toBeNull()
    expect(httpCommentModerationRegistration.validate(config)).toBeNull()
  })

  it('still requires a model before checkStatus can become active', async () => {
    const config = {
      endpoint: 'https://llm.example.com/v1/chat/completions',
      model: null
    }
    await expect(httpCommentModerationRegistration.checkStatus(config, {
      COMMENT_MODERATION_API_KEY: 'secret'
    })).resolves.toEqual({
      status: 'misconfigured',
      error: 'Model is required'
    })
  })

  it('reports secret readiness and probes chat completions before becoming active', async () => {
    const config = {
      endpoint: 'https://llm.example.com/v1/chat/completions',
      model: 'safe-model'
    }

    await expect(httpCommentModerationRegistration.checkStatus(config, {})).resolves.toEqual({
      status: 'unavailable',
      error: 'Missing COMMENT_MODERATION_API_KEY secret'
    })
    const fetchMock = vi.fn().mockResolvedValue(chatAllowResponse(0.99))
    await expect(
      httpCommentModerationRegistration.checkStatus(config, {
        COMMENT_MODERATION_API_KEY: 'secret',
        fetch: fetchMock
      })
    ).resolves.toEqual({ status: 'active' })
    expect(fetchMock).toHaveBeenCalledOnce()
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))
    expect(body.model).toBe('safe-model')
    expect(body.messages[0].role).toBe('system')
  })

  it('lists models from the derived OpenAI-compatible /v1/models endpoint without a model id', async () => {
    const config = {
      endpoint: 'https://llm.example.com/v1/chat/completions',
      model: null,
      availableModels: [] as string[]
    }
    const fetchMock = vi.fn().mockResolvedValue(modelsResponse(['zeta-model', 'alpha-model']))

    await expect(httpCommentModerationRegistration.executeAction?.('listModels', config, {
      COMMENT_MODERATION_API_KEY: 'secret',
      fetch: fetchMock
    })).resolves.toEqual({
      config: {
        ...config,
        availableModels: ['alpha-model', 'zeta-model']
      },
      status: 'active',
      error: null
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example.com/v1/models',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('does not report active when the model omits confidence required by the policy', async () => {
    const config = {
      endpoint: 'https://llm.example.com/v1/chat/completions',
      model: 'safe-model'
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'chatcmpl-health',
      model: 'safe-model',
      choices: [{ message: { content: JSON.stringify({ decision: 'allow' }) } }]
    }), { status: 200 }))

    await expect(httpCommentModerationRegistration.checkStatus(config, {
      COMMENT_MODERATION_API_KEY: 'secret',
      fetch: fetchMock
    })).resolves.toEqual({
      status: 'misconfigured',
      error: 'Moderation provider must return confidence for automatic decisions'
    })
  })

  it.each([
    'https://localhost/v1/chat/completions',
    'https://127.0.0.1/v1/chat/completions',
    'https://192.168.1.5/v1/chat/completions',
    'https://user:pass@llm.example.com/v1/chat/completions'
  ])('rejects non-public moderation endpoints: %s', (endpoint) => {
    const config = httpCommentModerationRegistration.configSchema.parse({
      endpoint,
      model: 'safe-model'
    }) as Record<string, unknown>
    expect(httpCommentModerationRegistration.validate(config)).toBeTruthy()
  })
})
