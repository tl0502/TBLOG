import type { AppDatabase } from '../database/client'
import { mediaReferences } from '../database/schema'
import type { MediaReferenceRepository } from './contracts/media-repositories'

export function createMediaReferenceRepository(db: AppDatabase): MediaReferenceRepository {
  return {
    async create(input) {
      await db.insert(mediaReferences).values(input)
    }
  }
}
