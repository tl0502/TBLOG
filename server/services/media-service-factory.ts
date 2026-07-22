import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import { resolveStorageProviderForEvent } from '../providers/storage/storage-provider-factory'
import { createMediaReferenceRepository } from '../repositories/media-reference-repository'
import { createMediaService } from './media-service'

export function createMediaServiceForEvent(event: H3Event) {
  return createMediaService({
    mediaRepository: createMediaReferenceRepository(getDatabaseClient(event)),
    resolveStorageProvider: () => resolveStorageProviderForEvent(event)
  })
}
