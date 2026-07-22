import { describe, expect, it } from 'vitest'
import {
  createR2StorageProvider,
  type R2BucketLike,
  type R2ObjectLike
} from '../../../server/providers/storage/r2-storage-provider'

interface PutCall {
  key: string
  value: unknown
  options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }
}

function createFakeBucket(seed: Record<string, R2ObjectLike> = {}) {
  const objects = new Map<string, R2ObjectLike>(Object.entries(seed))
  const calls = { put: [] as PutCall[], head: [] as string[], delete: [] as string[] }
  const bucket: R2BucketLike = {
    async put(key, value, options) {
      calls.put.push({ key, value, options })
      const object: R2ObjectLike = {
        key,
        size: typeof value === 'string' ? value.length : 0,
        httpMetadata: options?.httpMetadata,
        uploaded: new Date('2026-07-15T00:00:00.000Z')
      }
      objects.set(key, object)
      return object
    },
    async head(key) {
      calls.head.push(key)
      return objects.get(key) ?? null
    },
    async delete(key) {
      calls.delete.push(key)
      objects.delete(key)
    }
  }
  return { bucket, objects, calls }
}

const options = { publicBaseUrl: 'https://media.example.com', keyPrefix: 'uploads/' }

describe('r2 storage provider', () => {
  it('puts an object with the prefixed key and content type, returning its metadata', async () => {
    const { bucket, calls } = createFakeBucket()
    const provider = createR2StorageProvider({ bucket, ...options })

    const metadata = await provider.put({ key: 'a.png', body: 'binary', contentType: 'image/png' })

    expect(calls.put[0].key).toBe('uploads/a.png')
    expect(calls.put[0].options).toEqual({ httpMetadata: { contentType: 'image/png' } })
    expect(metadata).toEqual({
      key: 'uploads/a.png',
      size: 6,
      contentType: 'image/png',
      uploadedAt: new Date('2026-07-15T00:00:00.000Z')
    })
  })

  it('omits R2 http metadata when no content type is provided', async () => {
    const { bucket, calls } = createFakeBucket()
    const provider = createR2StorageProvider({ bucket, ...options })

    await provider.put({ key: 'a.bin', body: 'x' })

    expect(calls.put[0].options).toBeUndefined()
  })

  it('stores explicit cache-control HTTP metadata', async () => {
    const { bucket, calls } = createFakeBucket()
    const provider = createR2StorageProvider({ bucket, ...options })

    await provider.put({
      key: 'a.png',
      body: 'binary',
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable'
    })

    expect(calls.put[0].options).toEqual({
      httpMetadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000, immutable'
      }
    })
  })

  it('heads an existing object and returns null for a missing one', async () => {
    const { bucket } = createFakeBucket({
      'uploads/a.png': {
        key: 'uploads/a.png',
        size: 12,
        httpMetadata: { contentType: 'image/png' },
        uploaded: new Date('2026-07-15T00:00:00.000Z')
      }
    })
    const provider = createR2StorageProvider({ bucket, ...options })

    await expect(provider.head('a.png')).resolves.toMatchObject({ key: 'uploads/a.png', size: 12 })
    await expect(provider.head('missing.png')).resolves.toBeNull()
  })

  it('deletes the prefixed key', async () => {
    const { bucket, calls } = createFakeBucket()
    const provider = createR2StorageProvider({ bucket, ...options })

    await provider.delete('a.png')

    expect(calls.delete).toEqual(['uploads/a.png'])
  })

  it('builds a public URL from the base URL, prefix, and key', () => {
    const { bucket } = createFakeBucket()
    const provider = createR2StorageProvider({ bucket, publicBaseUrl: 'https://media.example.com/', keyPrefix: 'uploads/' })

    expect(provider.publicUrl('a.png')).toBe('https://media.example.com/uploads/a.png')
  })

  it('percent-encodes each public object-key path segment', () => {
    const { bucket } = createFakeBucket()
    const provider = createR2StorageProvider({
      bucket,
      publicBaseUrl: 'https://media.example.com/assets',
      keyPrefix: 'uploads/'
    })

    expect(provider.publicUrl('图片,a #1.png')).toBe(
      'https://media.example.com/assets/uploads/%E5%9B%BE%E7%89%87%2Ca%20%231.png'
    )
  })
})
