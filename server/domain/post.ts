export const postTypeValues = ['article', 'page'] as const
export const postStatusValues = ['draft', 'published'] as const

export type PostType = (typeof postTypeValues)[number]
export type PostStatus = (typeof postStatusValues)[number]
