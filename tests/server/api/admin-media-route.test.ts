import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readMultipartFormData } from 'h3'
import { authError } from '../../../server/domain/auth-errors'
import { mediaError } from '../../../server/domain/media-errors'
import {
  MAX_MEDIA_ALT_TEXT_BYTES,
  MAX_MEDIA_MULTIPART_BYTES,
  type MediaService
} from '../../../server/services/media-service'
import { createMediaServiceForEvent } from '../../../server/services/media-service-factory'
import { requireAdmin } from '../../../server/utils/require-admin'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    readMultipartFormData: vi.fn()
  }
})

vi.mock('../../../server/utils/require-admin', () => ({
  requireAdmin: vi.fn()
}))

vi.mock('../../../server/services/media-service-factory', () => ({
  createMediaServiceForEvent: vi.fn()
}))

import uploadMedia from '../../../server/api/v1/admin/media/index.post'

type Handler = (event: unknown) => Promise<unknown>

const currentAdmin = {
  administrator: { id: 'admin-1', username: 'admin' },
  permissions: ['post:*'] as const
}

function makeEvent(headers: Record<string, string> = {}) {
  return {
    node: {
      req: { headers: { 'cf-ray': 'request-1', 'content-length': '1024', ...headers } },
      res: { statusCode: 200, setHeader: vi.fn() }
    },
    context: {}
  }
}

function mediaService(upload: ReturnType<typeof vi.fn>) {
  vi.mocked(createMediaServiceForEvent).mockReturnValue({ upload } as MediaService)
}

function expectErrorEnvelope(body: unknown, expected: { code: string; message: string }) {
  expect(body).toEqual({
    error: {
      code: expected.code,
      message: expected.message,
      details: {},
      requestId: 'request-1'
    }
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue(currentAdmin as never)
})

describe('admin media upload route', () => {
  it('requires an administrator before parsing multipart data or creating the service', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      authError('unauthorized', 'Authentication is required', 401)
    )
    const event = makeEvent()

    const body = await (uploadMedia as Handler)(event)

    expect(requireAdmin).toHaveBeenCalledWith(event)
    expect(readMultipartFormData).not.toHaveBeenCalled()
    expect(createMediaServiceForEvent).not.toHaveBeenCalled()
    expectErrorEnvelope(body, { code: 'unauthorized', message: 'Authentication is required' })
    expect(event.node.res.statusCode).toBe(401)
  })

  it('parses the multipart file and alt text, passes permissions, and returns 201', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    vi.mocked(readMultipartFormData).mockResolvedValue([
      {
        name: 'file',
        filename: 'hero.png',
        type: 'image/png',
        data: bytes
      },
      {
        name: 'altText',
        data: Buffer.from('Article hero')
      }
    ])
    const result = {
      id: 'media-1',
      url: 'https://media.example/images/media-1.png',
      contentType: 'image/png',
      size: bytes.byteLength
    }
    const upload = vi.fn().mockResolvedValue(result)
    mediaService(upload)
    const event = makeEvent()

    const body = await (uploadMedia as Handler)(event)

    expect(requireAdmin).toHaveBeenCalledWith(event)
    expect(readMultipartFormData).toHaveBeenCalledWith(event)
    expect(createMediaServiceForEvent).toHaveBeenCalledWith(event)
    expect(upload).toHaveBeenCalledWith(
      {
        filename: 'hero.png',
        contentType: 'image/png',
        bytes,
        altText: 'Article hero'
      },
      currentAdmin.permissions
    )
    expect(body).toEqual({ data: result, meta: {} })
    expect(event.node.res.statusCode).toBe(201)
  })

  it('returns 422 when the multipart body does not include a file', async () => {
    vi.mocked(readMultipartFormData).mockResolvedValue([
      {
        name: 'altText',
        data: Buffer.from('Missing image')
      }
    ])
    const event = makeEvent()

    const body = await (uploadMedia as Handler)(event)

    expect(readMultipartFormData).toHaveBeenCalledWith(event)
    expect(createMediaServiceForEvent).not.toHaveBeenCalled()
    expectErrorEnvelope(body, {
      code: 'validation_failed',
      message: 'One image file is required'
    })
    expect(event.node.res.statusCode).toBe(422)
  })

  it.each([
    [{ 'content-length': '' }, 'A bounded Content-Length is required'],
    [{ 'content-length': String(MAX_MEDIA_MULTIPART_BYTES + 1) }, 'Media upload is too large']
  ])('rejects an unbounded or oversized request before multipart buffering', async (headers, message) => {
    const event = makeEvent(headers)

    const body = await (uploadMedia as Handler)(event)

    expect(readMultipartFormData).not.toHaveBeenCalled()
    expectErrorEnvelope(body, { code: 'validation_failed', message })
    expect(event.node.res.statusCode).toBe(422)
  })

  it('rejects unexpected or excessive multipart fields', async () => {
    vi.mocked(readMultipartFormData).mockResolvedValue([
      { name: 'file', filename: 'hero.png', type: 'image/png', data: Buffer.from([1]) },
      { name: 'altText', data: Buffer.from('Hero') },
      { name: 'caption', data: Buffer.from('Unexpected') }
    ])
    const event = makeEvent()

    const body = await (uploadMedia as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'validation_failed',
      message: 'Media upload must contain only one file and optional alt text'
    })
    expect(createMediaServiceForEvent).not.toHaveBeenCalled()
  })

  it('rejects oversized alt text before invoking the media service', async () => {
    vi.mocked(readMultipartFormData).mockResolvedValue([
      { name: 'file', filename: 'hero.png', type: 'image/png', data: Buffer.from([1]) },
      { name: 'altText', data: Buffer.alloc(MAX_MEDIA_ALT_TEXT_BYTES + 1, 0x61) }
    ])
    const event = makeEvent()

    const body = await (uploadMedia as Handler)(event)

    expectErrorEnvelope(body, { code: 'validation_failed', message: 'Image alt text is too long' })
    expect(createMediaServiceForEvent).not.toHaveBeenCalled()
  })

  it('rejects invalid UTF-8 alt text before invoking the media service', async () => {
    vi.mocked(readMultipartFormData).mockResolvedValue([
      { name: 'file', filename: 'hero.png', type: 'image/png', data: Buffer.from([1]) },
      { name: 'altText', data: Buffer.from([0xc3, 0x28]) }
    ])
    const event = makeEvent()

    const body = await (uploadMedia as Handler)(event)

    expectErrorEnvelope(body, { code: 'validation_failed', message: 'Image alt text must be valid UTF-8' })
    expect(createMediaServiceForEvent).not.toHaveBeenCalled()
  })

  it('maps media service domain errors into the standard error envelope', async () => {
    vi.mocked(readMultipartFormData).mockResolvedValue([
      {
        name: 'file',
        filename: 'hero.png',
        type: 'image/png',
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47])
      }
    ])
    const upload = vi.fn().mockRejectedValue(
      mediaError('storage_unavailable', 'Media storage is not configured', 503)
    )
    mediaService(upload)
    const event = makeEvent()

    const body = await (uploadMedia as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'storage_unavailable',
      message: 'Media storage is not configured'
    })
    expect(event.node.res.statusCode).toBe(503)
  })
})
