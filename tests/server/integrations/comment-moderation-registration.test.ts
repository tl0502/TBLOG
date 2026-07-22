import { httpCommentModerationRegistration } from '../../../server/integrations/providers/http-comment-moderation'

describe('HTTP comment moderation integration registration', () => {
  it('requires an HTTPS endpoint and keeps the API key outside stored config', () => {
    const config = httpCommentModerationRegistration.configSchema.parse({
      endpoint: 'https://moderation.example.com/v1/comments',
      model: 'safe-model',
      timeoutMs: '4000'
    }) as Record<string, unknown>

    expect(httpCommentModerationRegistration.validate(config)).toBeNull()
    expect(httpCommentModerationRegistration.publicProjection(config)).toEqual({
      endpoint: 'https://moderation.example.com/v1/comments',
      model: 'safe-model',
      timeoutMs: 4000
    })
    expect(httpCommentModerationRegistration.requiredSecrets).toEqual([
      'COMMENT_MODERATION_API_KEY'
    ])
    expect(JSON.stringify(config)).not.toContain('apiKey')
  })

  it('rejects non-HTTPS endpoints', () => {
    const config = httpCommentModerationRegistration.configSchema.parse({
      endpoint: 'http://moderation.example.com/v1/comments'
    }) as Record<string, unknown>

    expect(httpCommentModerationRegistration.validate(config)).toContain('HTTPS')
  })

  it('reports secret readiness and probes the configured protocol before becoming active', async () => {
    const config = { endpoint: 'https://moderation.example.com/v1/comments' }

    await expect(httpCommentModerationRegistration.checkStatus(config, {})).resolves.toEqual({
      status: 'unavailable',
      error: 'Missing COMMENT_MODERATION_API_KEY secret'
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      decision: 'allow',
      confidence: 0.99
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))
    await expect(
      httpCommentModerationRegistration.checkStatus(config, {
        COMMENT_MODERATION_API_KEY: 'secret',
        fetch: fetchMock
      })
    ).resolves.toEqual({ status: 'active' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does not report active when the provider omits confidence required by the policy', async () => {
    const config = { endpoint: 'https://moderation.example.com/v1/comments' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ decision: 'allow' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))

    await expect(httpCommentModerationRegistration.checkStatus(config, {
      COMMENT_MODERATION_API_KEY: 'secret',
      fetch: fetchMock
    })).resolves.toEqual({
      status: 'misconfigured',
      error: 'Moderation provider must return confidence for automatic decisions'
    })
  })

  it.each([
    'https://localhost/moderate',
    'https://127.0.0.1/moderate',
    'https://192.168.1.5/moderate',
    'https://user:pass@moderation.example.com/moderate'
  ])('rejects non-public moderation endpoints: %s', (endpoint) => {
    const config = httpCommentModerationRegistration.configSchema.parse({ endpoint }) as Record<string, unknown>
    expect(httpCommentModerationRegistration.validate(config)).toBeTruthy()
  })
})
