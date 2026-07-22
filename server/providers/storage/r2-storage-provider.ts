import type { StorageProvider, StoragePutInput, StoredObjectMetadata } from './storage-provider'

/** Minimal structural view of a Cloudflare R2 bucket binding — only the methods this adapter uses. */
export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }
  ): Promise<R2ObjectLike | null>
  head(key: string): Promise<R2ObjectLike | null>
  delete(key: string): Promise<void>
}

export interface R2ObjectLike {
  key: string
  size: number
  httpMetadata?: { contentType?: string }
  uploaded?: Date
}

export interface R2StorageProviderOptions {
  bucket: R2BucketLike
  /** Public base URL of the bucket. Production deployments should use an R2 custom domain. */
  publicBaseUrl: string
  /** Prepended to every object key. */
  keyPrefix?: string
}

function toMetadata(
  key: string,
  object: R2ObjectLike | null,
  fallbackContentType?: string
): StoredObjectMetadata {
  return {
    key,
    size: object?.size ?? 0,
    contentType: object?.httpMetadata?.contentType ?? fallbackContentType ?? null,
    uploadedAt: object?.uploaded ?? null
  }
}

/**
 * `StorageProvider` over a Cloudflare R2 bucket binding. Object writes go through the binding (never a
 * persisted secret); the public URL is composed from the configured public base URL. Errors propagate
 * so the caller (an admin upload flow) can report a clear failure — unlike the cache, a dropped write
 * here would silently lose an upload.
 */
export function createR2StorageProvider(options: R2StorageProviderOptions): StorageProvider {
  const { bucket, publicBaseUrl } = options
  const prefix = options.keyPrefix ?? ''

  function fullKey(key: string): string {
    return prefix ? `${prefix}${key}` : key
  }

  function encodedPublicKey(key: string): string {
    return fullKey(key)
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
  }

  return {
    async put(input: StoragePutInput): Promise<StoredObjectMetadata> {
      const key = fullKey(input.key)
      const httpMetadata = {
        ...(input.contentType ? { contentType: input.contentType } : {}),
        ...(input.cacheControl ? { cacheControl: input.cacheControl } : {})
      }
      const object = await bucket.put(
        key,
        input.body,
        input.contentType || input.cacheControl ? { httpMetadata } : undefined
      )
      return toMetadata(key, object, input.contentType)
    },
    async head(key: string): Promise<StoredObjectMetadata | null> {
      const full = fullKey(key)
      const object = await bucket.head(full)
      return object ? toMetadata(full, object) : null
    },
    async delete(key: string): Promise<void> {
      await bucket.delete(fullKey(key))
    },
    publicUrl(key: string): string {
      return `${publicBaseUrl.replace(/\/+$/, '')}/${encodedPublicKey(key)}`
    }
  }
}
