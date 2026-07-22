import { vi } from 'vitest'
import {
  createTurnstileCommentProtectionProvider,
  probeTurnstileSecret,
  TURNSTILE_SITEVERIFY_URL
} from '../../../server/providers/comment-protection/turnstile-comment-protection-provider'

describe('Turnstile comment protection provider', () => {
  it('posts the token to Siteverify and accepts the comment action', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      action: 'comment',
      hostname: 'blog.example.com'
    })))
    const provider = createTurnstileCommentProtectionProvider({
      secretKey: 'secret',
      fetch: fetcher
    })

    await provider.verify({
      token: 'token',
      remoteIp: '203.0.113.8',
      expectedHostname: 'BLOG.EXAMPLE.COM.'
    })

    expect(fetcher).toHaveBeenCalledWith(
      TURNSTILE_SITEVERIFY_URL,
      expect.objectContaining({ method: 'POST' })
    )
    const request = fetcher.mock.calls[0]![1]
    expect(JSON.parse(String(request.body))).toMatchObject({
      secret: 'secret',
      response: 'token',
      remoteip: '203.0.113.8'
    })
  })

  it('rejects missing/invalid tokens and treats provider failures as unavailable', async () => {
    const provider = createTurnstileCommentProtectionProvider({
      secretKey: 'secret',
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }))
      )
    })
    await expect(provider.verify({ token: '' })).rejects.toMatchObject({
      kind: 'rejected'
    })
    await expect(provider.verify({ token: 'bad' })).rejects.toMatchObject({
      kind: 'rejected'
    })

    const unavailable = createTurnstileCommentProtectionProvider({
      secretKey: 'secret',
      fetch: vi.fn().mockRejectedValue(new Error('network'))
    })
    await expect(unavailable.verify({ token: 'token' })).rejects.toMatchObject({
      kind: 'unavailable'
    })
  })

  it('rejects a valid comment token minted for a different hostname', async () => {
    const provider = createTurnstileCommentProtectionProvider({
      secretKey: 'secret',
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        success: true,
        action: 'comment',
        hostname: 'other.example.com'
      })))
    })

    await expect(provider.verify({
      token: 'token',
      expectedHostname: 'blog.example.com'
    })).rejects.toMatchObject({ kind: 'rejected' })
  })

  it('rejects a successful token when the caller omits the expected hostname', async () => {
    const provider = createTurnstileCommentProtectionProvider({
      secretKey: 'secret',
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        success: true,
        action: 'comment',
        hostname: 'blog.example.com'
      })))
    })

    await expect(provider.verify({ token: 'token' })).rejects.toMatchObject({ kind: 'rejected' })
  })

  it('probes secret validity without accepting an invalid secret', async () => {
    await expect(probeTurnstileSecret({
      secretKey: 'valid-secret',
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        success: false,
        'error-codes': ['invalid-input-response']
      })))
    })).resolves.toBe(true)

    await expect(probeTurnstileSecret({
      secretKey: 'invalid-secret',
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        success: false,
        'error-codes': ['invalid-input-secret']
      })))
    })).resolves.toBe(false)
  })
})
