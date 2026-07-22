export interface CreateMediaReferenceInput {
  id: string
  url: string
  altText: string | null
  width: number | null
  height: number | null
  caption: string | null
  providerKey: string
  referenceState: string
  createdAt: Date
  updatedAt: Date
}

export interface MediaReferenceRepository {
  create(input: CreateMediaReferenceInput): Promise<void>
}
