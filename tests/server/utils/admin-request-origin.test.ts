import { getRequestHeader, getRequestURL } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return { ...actual, getRequestHeader: vi.fn(), getRequestURL: vi.fn() }
})

import { assertAdminRequestOrigin } from '../../../server/utils/admin-request-origin'

function event(method = 'POST') {
  return { method, node: { req: { method, headers: {} } }, context: {} } as never
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getRequestURL).mockReturnValue(new URL('https://blog.example/api/v1/admin/sessions'))
  vi.mocked(getRequestHeader).mockReturnValue(undefined)
})

describe('administrator request origin policy', () => {
  it('allows safe requests and command-line mutations without browser metadata', () => {
    expect(() => assertAdminRequestOrigin(event('GET'))).not.toThrow()
    expect(() => assertAdminRequestOrigin(event('POST'))).not.toThrow()
  })

  it('allows an exact same-origin browser mutation', () => {
    vi.mocked(getRequestHeader).mockImplementation((_, name) => ({
      origin: 'https://blog.example',
      'sec-fetch-site': 'same-origin'
    }[name.toLowerCase()]))
    expect(() => assertAdminRequestOrigin(event())).not.toThrow()
  })

  it('rejects cross-origin, opaque-origin, and same-site cross-origin browser mutations', () => {
    const cases: Array<Record<string, string>> = [
      { origin: 'https://evil.example' },
      { origin: 'null' },
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'same-site' }
    ]
    for (const headers of cases) {
      vi.mocked(getRequestHeader).mockImplementation((_, name) => headers[name.toLowerCase()])
      expect(() => assertAdminRequestOrigin(event())).toThrow(expect.objectContaining({
        code: 'invalid_request_origin', statusCode: 403
      }))
    }
  })
})
