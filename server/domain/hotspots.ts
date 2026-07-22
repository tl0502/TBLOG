import type { PublicPostListItem } from '../repositories/contracts/public-read-repositories'

export interface PublicHotspotItem {
  article: PublicPostListItem
  pageViews: number | null
  trend?: 'up' | 'steady' | 'down' | null
  fallback: boolean
}

export interface PublicHotspots {
  current: PublicHotspotItem[]
  historical: PublicHotspotItem[]
}
