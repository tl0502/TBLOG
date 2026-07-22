import { z } from 'zod'
import { DEFAULT_PUBLIC_LIST_LIMIT } from '../repositories/contracts/public-read-repositories'
import { decodeCursor } from '../utils/cursor'
import { HOME_FEED_PAGE_SIZE, homeFeedSortValues, sortOrderValues } from '../../types/home-feed'

export const slugParamSchema = z.string().trim().min(1).max(200)

export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).max(256).refine((value) => decodeCursor(value) !== null, {
    message: 'Invalid pagination cursor'
  }).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(DEFAULT_PUBLIC_LIST_LIMIT)
})

export const homeFeedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(HOME_FEED_PAGE_SIZE).default(HOME_FEED_PAGE_SIZE),
  sort: z.enum(homeFeedSortValues).default('publishedAt'),
  order: z.enum(sortOrderValues).default('desc')
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>
export type HomeFeedQuery = z.infer<typeof homeFeedQuerySchema>
