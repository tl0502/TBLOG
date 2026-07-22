import { vi } from 'vitest'
import {
  createMediaService,
  MEDIA_IMMUTABLE_CACHE_CONTROL,
  MAX_MEDIA_ALT_TEXT_BYTES,
  MAX_MEDIA_FILENAME_BYTES,
  MAX_MEDIA_UPLOAD_BYTES
} from '../../../server/services/media-service'

describe('media service', () => {
  const signatures = {
    'image/jpeg': new Uint8Array([0xff, 0xd8, 0xff]),
    'image/png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'image/gif': new TextEncoder().encode('GIF89a'),
    'image/webp': new Uint8Array([
      ...new TextEncoder().encode('RIFF'),
      0x04, 0x00, 0x00, 0x00,
      ...new TextEncoder().encode('WEBP')
    ]),
    'image/avif': new Uint8Array([
      0x00, 0x00, 0x00, 0x10,
      ...new TextEncoder().encode('ftypavif'),
      0x00, 0x00, 0x00, 0x00
    ])
  } as const

  function createStorage() {
    return {
      put: vi.fn().mockResolvedValue({ key: 'stored', size: 8, contentType: 'image/png', uploadedAt: null }),
      head: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      publicUrl: vi.fn((key: string) => `https://media.example/${key}`)
    }
  }

  it('uploads through storage and records the public media reference', async () => {
    const storage = createStorage()
    const create = vi.fn().mockResolvedValue(undefined)
    const service = createMediaService({
      mediaRepository: { create },
      resolveStorageProvider: async () => storage,
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      generateId: () => 'media-id'
    })

    const result = await service.upload(
      { filename: 'photo.png', contentType: 'image/png', bytes: signatures['image/png'], altText: 'Photo' },
      ['post:*']
    )

    expect(storage.put).toHaveBeenCalledWith(expect.objectContaining({
      key: 'images/2026/07/media-id.png',
      contentType: 'image/png',
      cacheControl: MEDIA_IMMUTABLE_CACHE_CONTROL
    }))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      id: 'media-id',
      url: 'https://media.example/images/2026/07/media-id.png',
      providerKey: 'cloudflare-r2',
      referenceState: 'stored'
    }))
    expect(result.url).toContain('media-id.png')
  })

  it.each(Object.entries(signatures))('accepts a valid minimal %s signature', async (contentType, bytes) => {
    const storage = createStorage()
    const service = createMediaService({
      mediaRepository: { create: vi.fn().mockResolvedValue(undefined) },
      resolveStorageProvider: async () => storage,
      generateId: () => 'media-id'
    })

    await expect(service.upload(
      { filename: 'image', contentType, bytes },
      ['post:*']
    )).resolves.toMatchObject({ contentType, size: bytes.byteLength })
  })

  it.each(Object.keys(signatures))('rejects content that does not match declared type %s', async (contentType) => {
    const resolveStorageProvider = vi.fn()
    const service = createMediaService({
      mediaRepository: { create: vi.fn() },
      resolveStorageProvider
    })
    const differentValidImage = contentType === 'image/png'
      ? signatures['image/jpeg']
      : signatures['image/png']

    await expect(service.upload(
      { filename: 'mismatch', contentType, bytes: differentValidImage },
      ['post:*']
    )).rejects.toMatchObject({ code: 'invalid_media' })
    expect(resolveStorageProvider).not.toHaveBeenCalled()
  })

  it('requires post permission before resolving storage', async () => {
    const resolveStorageProvider = vi.fn()
    const service = createMediaService({
      mediaRepository: { create: vi.fn() },
      resolveStorageProvider
    })

    await expect(service.upload(
      { filename: 'x.png', contentType: 'image/png', bytes: signatures['image/png'] },
      []
    )).rejects.toMatchObject({ code: 'forbidden' })
    expect(resolveStorageProvider).not.toHaveBeenCalled()
  })

  it.each([
    { filename: '', altText: undefined },
    { filename: 'a'.repeat(MAX_MEDIA_FILENAME_BYTES + 1), altText: undefined },
    { filename: 'image.png', altText: 'a'.repeat(MAX_MEDIA_ALT_TEXT_BYTES + 1) }
  ])('rejects oversized or invalid text metadata before resolving storage: %#', async ({ filename, altText }) => {
    const resolveStorageProvider = vi.fn()
    const service = createMediaService({
      mediaRepository: { create: vi.fn() },
      resolveStorageProvider
    })

    await expect(service.upload(
      { filename, contentType: 'image/png', bytes: signatures['image/png'], altText },
      ['post:*']
    )).rejects.toMatchObject({ code: 'invalid_media' })
    expect(resolveStorageProvider).not.toHaveBeenCalled()
  })

  it('deletes the stored object when reference persistence fails', async () => {
    const storage = createStorage()
    const service = createMediaService({
      mediaRepository: { create: vi.fn().mockRejectedValue(new Error('database unavailable')) },
      resolveStorageProvider: async () => storage,
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      generateId: () => 'media-id'
    })

    await expect(service.upload(
      { filename: 'x.png', contentType: 'image/png', bytes: signatures['image/png'] },
      ['post:*']
    )).rejects.toMatchObject({ code: 'media_upload_failed' })
    expect(storage.delete).toHaveBeenCalledWith('images/2026/07/media-id.png')
  })

  it('retries transient cleanup failures after reference persistence fails', async () => {
    const storage = createStorage()
    storage.delete
      .mockRejectedValueOnce(new Error('temporary R2 failure'))
      .mockRejectedValueOnce(new Error('temporary R2 failure'))
      .mockResolvedValueOnce(undefined)
    const service = createMediaService({
      mediaRepository: { create: vi.fn().mockRejectedValue(new Error('database unavailable')) },
      resolveStorageProvider: async () => storage,
      generateId: () => 'media-id',
      now: () => new Date('2026-07-16T12:00:00.000Z')
    })

    await expect(service.upload(
      { filename: 'x.png', contentType: 'image/png', bytes: signatures['image/png'] },
      ['post:*']
    )).rejects.toMatchObject({ code: 'media_upload_failed' })
    expect(storage.delete).toHaveBeenCalledTimes(3)
  })

  it('rejects unsupported/oversized files and unavailable storage', async () => {
    const service = createMediaService({
      mediaRepository: { create: vi.fn() },
      resolveStorageProvider: async () => null
    })
    await expect(service.upload(
      { filename: 'x.svg', contentType: 'image/svg+xml', bytes: new Uint8Array([1]) },
      ['post:*']
    )).rejects.toMatchObject({ code: 'invalid_media' })
    await expect(service.upload(
      { filename: 'x.png', contentType: 'image/png', bytes: new Uint8Array(MAX_MEDIA_UPLOAD_BYTES + 1) },
      ['post:*']
    )).rejects.toMatchObject({ code: 'invalid_media' })
    await expect(service.upload(
      { filename: 'x.png', contentType: 'image/png', bytes: signatures['image/png'] },
      ['post:*']
    )).rejects.toMatchObject({ code: 'storage_unavailable' })
  })

  it('maps storage resolver failures to a safe unavailable error', async () => {
    const service = createMediaService({
      mediaRepository: { create: vi.fn() },
      resolveStorageProvider: async () => { throw new Error('binding lookup failed') }
    })

    await expect(service.upload(
      { filename: 'x.png', contentType: 'image/png', bytes: signatures['image/png'] },
      ['post:*']
    )).rejects.toMatchObject({ code: 'storage_unavailable', statusCode: 503 })
  })
})
