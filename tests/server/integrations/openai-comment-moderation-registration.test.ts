import { findRegistration } from '../../../server/integrations/registry'
import {
  openAiCommentModerationConfigSchema,
  openAiCommentModerationRegistration,
  OPENAI_API_KEY_SECRET
} from '../../../server/integrations/providers/openai-comment-moderation'
import { DEFAULT_OPENAI_MODERATION_MODEL } from '../../../server/providers/comment-moderation/openai-comment-moderation-provider'

function moderationResponse() {
  return new Response(JSON.stringify({
    id: 'modr-health-check',
    model: 'omni-moderation-latest-2026-01-01',
    results: [{
      flagged: false,
      categories: { harassment: false },
      category_scores: { harassment: 0.01 }
    }]
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('OpenAI comment moderation integration registration', () => {
  it('registers a fixed moderation model and stores no secret configuration', () => {
    const config = openAiCommentModerationConfigSchema.parse({
      model: DEFAULT_OPENAI_MODERATION_MODEL,
      timeoutMs: '4000',
      apiKey: 'must-not-be-persisted'
    }) as Record<string, unknown>

    expect(config).toEqual({ model: DEFAULT_OPENAI_MODERATION_MODEL, timeoutMs: 4000 })
    expect(openAiCommentModerationRegistration.publicProjection(config)).toEqual(config)
    expect(openAiCommentModerationRegistration.requiredSecrets).toEqual([OPENAI_API_KEY_SECRET])
    expect(findRegistration('commentModeration', 'openai')).toBe(openAiCommentModerationRegistration)
    expect(JSON.stringify(config)).not.toContain('must-not-be-persisted')
  })

  it('fails closed without the OpenAI API key', async () => {
    const config = { model: DEFAULT_OPENAI_MODERATION_MODEL, timeoutMs: 5_000 }

    await expect(openAiCommentModerationRegistration.checkStatus(config, {})).resolves.toEqual({
      status: 'unavailable',
      error: `Missing ${OPENAI_API_KEY_SECRET} secret`
    })
    expect(openAiCommentModerationRegistration.createCommentModerationProvider?.(config, {})).toBeNull()
  })

  it('probes the Moderation API before becoming active', async () => {
    const fetch = vi.fn().mockResolvedValue(moderationResponse())
    const config = { model: DEFAULT_OPENAI_MODERATION_MODEL, timeoutMs: 5_000 }

    await expect(openAiCommentModerationRegistration.checkStatus(config, {
      OPENAI_API_KEY: 'secret-key',
      fetch
    })).resolves.toEqual({ status: 'active' })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('reports a public-safe availability error when the OpenAI probe fails', async () => {
    const config = { model: DEFAULT_OPENAI_MODERATION_MODEL, timeoutMs: 5_000 }

    await expect(openAiCommentModerationRegistration.checkStatus(config, {
      OPENAI_API_KEY: 'bad-key',
      fetch: vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))
    })).resolves.toEqual({
      status: 'unavailable',
      error: 'OpenAI Moderation API probe failed'
    })
  })
})
