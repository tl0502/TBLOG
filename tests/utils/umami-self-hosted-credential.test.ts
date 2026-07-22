import { describe, expect, it, vi } from 'vitest'
import { generateUmamiSelfHostedCredential } from '../../utils/umami-self-hosted-credential'

describe('Umami self-hosted credential generator', () => {
  it('logs in, verifies the token, and returns target-bound JSON', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token: 'opaque-token',
        user: { id: 'user-1', username: 'reader', role: 'view-only' }
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'user-1', username: 'reader', role: 'view-only'
      })))

    await expect(generateUmamiSelfHostedCredential({
      apiBaseUrl: 'https://umami.example.com/api/',
      username: ' reader ',
      password: 'password',
      fetchImpl: fetch
    })).resolves.toBe(JSON.stringify({
      apiBaseUrl: 'https://umami.example.com/api',
      token: 'opaque-token'
    }))

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(new URL(String(fetch.mock.calls[0]![0])).pathname).toBe('/api/auth/login')
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
      body: JSON.stringify({ username: 'reader', password: 'password' })
    })
    expect(new URL(String(fetch.mock.calls[1]![0])).pathname).toBe('/api/auth/verify')
    expect(fetch.mock.calls[1]![1]?.headers).toMatchObject({
      authorization: 'Bearer opaque-token'
    })
  })

  it('reports rejected credentials and token verification failures safely', async () => {
    const rejected = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    await expect(generateUmamiSelfHostedCredential({
      apiBaseUrl: 'https://umami.example.com/api',
      username: 'reader',
      password: 'wrong',
      fetchImpl: rejected
    })).rejects.toThrow('rejected the username or password')

    const unverified = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'opaque-token' })))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(generateUmamiSelfHostedCredential({
      apiBaseUrl: 'https://umami.example.com/api',
      username: 'reader',
      password: 'password',
      fetchImpl: unverified
    })).rejects.toThrow('verification failed')
  })

  it('rejects insecure targets, invalid responses, and browser network failures', async () => {
    await expect(generateUmamiSelfHostedCredential({
      apiBaseUrl: 'http://umami.example.com/api',
      username: 'reader',
      password: 'password'
    })).rejects.toThrow('HTTPS')

    const invalid = vi.fn().mockResolvedValue(new Response('{}'))
    await expect(generateUmamiSelfHostedCredential({
      apiBaseUrl: 'https://umami.example.com/api',
      username: 'reader',
      password: 'password',
      fetchImpl: invalid
    })).rejects.toThrow('valid token')

    const network = vi.fn().mockRejectedValue(new TypeError('provider detail'))
    await expect(generateUmamiSelfHostedCredential({
      apiBaseUrl: 'https://umami.example.com/api',
      username: 'reader',
      password: 'password',
      fetchImpl: network
    })).rejects.toThrow('HTTPS and CORS')
  })
})
