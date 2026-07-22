import {
  mergeCommentProtectionRuntimeEnv
} from '../../../server/providers/comment-protection/comment-protection-provider-factory'
import {
  mergeCommentModerationRuntimeEnv,
  selectActiveCommentModerationRow
} from '../../../server/providers/comment-moderation/comment-moderation-provider-factory'
import type { StoredIntegration } from '../../../server/repositories/contracts/integration-repositories'

describe('comment provider runtime environment', () => {
  it.each([
    ['protection', mergeCommentProtectionRuntimeEnv],
    ['moderation', mergeCommentModerationRuntimeEnv]
  ])('uses process values locally and lets Cloudflare bindings win for %s', (_label, merge) => {
    expect(merge(
      { SHARED: 'process', LOCAL_ONLY: 'local' },
      { SHARED: 'cloudflare', BINDING_ONLY: 'binding' }
    )).toEqual({
      SHARED: 'cloudflare',
      LOCAL_ONLY: 'local',
      BINDING_ONLY: 'binding'
    })
  })

  it('selects exactly one active moderation provider and rejects ambiguous legacy state', () => {
    const http: StoredIntegration = {
      capability: 'commentModeration',
      providerKey: 'http',
      enabled: true,
      publicConfigJson: '{}',
      status: 'active',
      lastCheckedAt: new Date(0),
      lastError: null,
      updatedAt: new Date(0)
    }
    const openai: StoredIntegration = { ...http, providerKey: 'openai' }

    expect(selectActiveCommentModerationRow([http])).toBe(http)
    expect(selectActiveCommentModerationRow([http, openai])).toBeNull()
    expect(selectActiveCommentModerationRow([{ ...http, status: 'configured' }])).toBeNull()
  })
})
