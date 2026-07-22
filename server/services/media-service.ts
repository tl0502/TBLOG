import { authError } from '../domain/auth-errors'
import { mediaError } from '../domain/media-errors'
import type { StorageProvider } from '../providers/storage/storage-provider'
import type { MediaReferenceRepository } from '../repositories/contracts/media-repositories'
import type { Permission } from './permissions'

export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_MEDIA_ALT_TEXT_BYTES = 1024
export const MAX_MEDIA_FILENAME_BYTES = 255
export const MAX_MEDIA_MULTIPART_BYTES = MAX_MEDIA_UPLOAD_BYTES + 64 * 1024
export const MEDIA_IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
export const allowedMediaTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif'
} as const

export interface MediaServiceDependencies {
  mediaRepository: MediaReferenceRepository
  resolveStorageProvider: () => Promise<StorageProvider | null>
  now?: () => Date
  generateId?: () => string
}

export interface UploadMediaCommand {
  filename: string
  contentType: string
  bytes: Uint8Array
  altText?: string
}

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]) {
  return expected.every((value, index) => bytes[offset + index] === value)
}

function hasAscii(bytes: Uint8Array, offset: number, expected: string) {
  return [...expected].every((value, index) => bytes[offset + index] === value.charCodeAt(0))
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isAvif(bytes: Uint8Array) {
  if (bytes.byteLength < 16 || !hasAscii(bytes, 4, 'ftyp')) return false

  const boxSize = (
    bytes[0]! * 0x1000000
    + bytes[1]! * 0x10000
    + bytes[2]! * 0x100
    + bytes[3]!
  )
  if (boxSize < 16 || boxSize > bytes.byteLength) return false

  const isAvifBrand = (offset: number) => (
    hasAscii(bytes, offset, 'avif') || hasAscii(bytes, offset, 'avis')
  )
  if (isAvifBrand(8)) return true

  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    if (isAvifBrand(offset)) return true
  }
  return false
}

function hasExpectedImageSignature(contentType: keyof typeof allowedMediaTypes, bytes: Uint8Array) {
  switch (contentType) {
    case 'image/jpeg':
      return bytes.byteLength >= 3 && hasBytes(bytes, 0, [0xff, 0xd8, 0xff])
    case 'image/png':
      return bytes.byteLength >= 8 && hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/gif':
      return bytes.byteLength >= 6 && (hasAscii(bytes, 0, 'GIF87a') || hasAscii(bytes, 0, 'GIF89a'))
    case 'image/webp':
      return bytes.byteLength >= 12 && hasAscii(bytes, 0, 'RIFF') && hasAscii(bytes, 8, 'WEBP')
    case 'image/avif':
      return isAvif(bytes)
  }
}

function requirePostPermission(permissions: readonly Permission[]) {
  if (!permissions.includes('post:*')) throw authError('forbidden', 'Permission denied', 403)
}

async function removeUploadedObject(storage: StorageProvider, key: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await storage.delete(key)
      return
    } catch {
      // R2 failures are often transient; retry before surfacing the upload failure.
    }
  }
  // There is no durable queue in the Version One stack. Keep the key in logs so deployment
  // maintenance can reconcile an exceptionally persistent orphan without exposing it publicly.
  console.error('Failed to remove orphaned media object', { key })
}

export function createMediaService(dependencies: MediaServiceDependencies) {
  const now = dependencies.now ?? (() => new Date())
  const generateId = dependencies.generateId ?? (() => crypto.randomUUID())

  return {
    async upload(command: UploadMediaCommand, permissions: readonly Permission[]) {
      requirePostPermission(permissions)
      const filename = command.filename.trim()
      if (!filename || utf8ByteLength(filename) > MAX_MEDIA_FILENAME_BYTES) {
        throw mediaError('invalid_media', 'Image filename is invalid', 422)
      }
      if (command.altText !== undefined && utf8ByteLength(command.altText) > MAX_MEDIA_ALT_TEXT_BYTES) {
        throw mediaError('invalid_media', 'Image alt text is too long', 422)
      }
      const extension = allowedMediaTypes[command.contentType as keyof typeof allowedMediaTypes]
      if (!extension) {
        throw mediaError('invalid_media', 'Unsupported image type', 422)
      }
      if (command.bytes.byteLength === 0 || command.bytes.byteLength > MAX_MEDIA_UPLOAD_BYTES) {
        throw mediaError('invalid_media', 'Image must be between 1 byte and 10 MiB', 422)
      }
      if (!hasExpectedImageSignature(command.contentType as keyof typeof allowedMediaTypes, command.bytes)) {
        throw mediaError('invalid_media', 'Image content does not match its declared type', 422)
      }

      let storage: StorageProvider | null
      try {
        storage = await dependencies.resolveStorageProvider()
      } catch {
        throw mediaError('storage_unavailable', 'Media storage is temporarily unavailable', 503)
      }
      if (!storage) throw mediaError('storage_unavailable', 'Media storage is not configured', 503)

      const timestamp = now()
      const year = timestamp.getUTCFullYear()
      const month = String(timestamp.getUTCMonth() + 1).padStart(2, '0')
      const id = generateId()
      const key = `images/${year}/${month}/${id}.${extension}`
      const body = command.bytes.buffer.slice(
        command.bytes.byteOffset,
        command.bytes.byteOffset + command.bytes.byteLength
      ) as ArrayBuffer

      try {
        await storage.put({
          key,
          body,
          contentType: command.contentType,
          // Server-generated UUID keys are never overwritten, so public media can be cached safely.
          cacheControl: MEDIA_IMMUTABLE_CACHE_CONTROL
        })
        try {
          const url = storage.publicUrl(key)
          await dependencies.mediaRepository.create({
            id,
            url,
            altText: command.altText?.trim() || null,
            width: null,
            height: null,
            caption: null,
            providerKey: 'cloudflare-r2',
            referenceState: 'stored',
            createdAt: timestamp,
            updatedAt: timestamp
          })
          return { id, url, contentType: command.contentType, size: command.bytes.byteLength }
        } catch (error) {
          await removeUploadedObject(storage, key)
          throw error
        }
      } catch {
        throw mediaError('media_upload_failed', 'Media upload failed', 502)
      }
    }
  }
}

export type MediaService = ReturnType<typeof createMediaService>
