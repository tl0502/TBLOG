import type { PublicHotspots } from '../domain/hotspots'
import type { HomeRailDynamicData } from '../domain/home-rail'
import type {
  PublicHomeFeedPage,
  PublicHomeFeedQuery,
  PublicPostListItem,
  PublicTag
} from '../repositories/contracts/public-read-repositories'
import type { HomeFeedMeta } from '../../types/home-feed'

export interface PublicHomeBootstrapData {
  feed: {
    items: PublicPostListItem[]
    meta: HomeFeedMeta
  }
  featured: PublicPostListItem[]
  hotspots: PublicHotspots
  homeRail: HomeRailDynamicData
  tags: PublicTag[]
}

export const publicHomeBootstrapOptionalSections = ['featured', 'hotspots', 'homeRail', 'tags'] as const
export type PublicHomeBootstrapOptionalSection = typeof publicHomeBootstrapOptionalSections[number]

export interface PublicHomeBootstrapResult {
  data: PublicHomeBootstrapData
  degraded: PublicHomeBootstrapOptionalSection[]
}

export interface PublicHomeBootstrapServiceDependencies {
  getFeed: (query: PublicHomeFeedQuery) => Promise<PublicHomeFeedPage<PublicPostListItem>>
  getFeatured: () => Promise<PublicPostListItem[]>
  getHotspots: () => Promise<PublicHotspots>
  getHomeRail: () => Promise<HomeRailDynamicData>
  getTags: () => Promise<PublicTag[]>
}

export function createPublicHomeBootstrapService(
  dependencies: PublicHomeBootstrapServiceDependencies
) {
  async function optional<T>(
    section: PublicHomeBootstrapOptionalSection,
    promise: Promise<T>,
    fallback: T
  ): Promise<{ value: T; degraded: PublicHomeBootstrapOptionalSection | null }> {
    try {
      return { value: await promise, degraded: null }
    } catch {
      return { value: fallback, degraded: section }
    }
  }

  return {
    async getBootstrap(query: PublicHomeFeedQuery): Promise<PublicHomeBootstrapResult> {
      const [feedPage, featuredResult, hotspotsResult, homeRailResult, tagsResult] = await Promise.all([
        dependencies.getFeed(query),
        optional('featured', dependencies.getFeatured(), []),
        optional('hotspots', dependencies.getHotspots(), { current: [], historical: [] }),
        optional('homeRail', dependencies.getHomeRail(), { cards: {} }),
        optional('tags', dependencies.getTags(), [])
      ])
      const { items, ...meta } = feedPage
      const degraded = [featuredResult, hotspotsResult, homeRailResult, tagsResult]
        .map((result) => result.degraded)
        .filter((section): section is PublicHomeBootstrapOptionalSection => section !== null)
      const featured = featuredResult.degraded
        ? (items[0] ? [items[0]] : [])
        : featuredResult.value

      return {
        data: {
          feed: { items, meta },
          featured,
          hotspots: hotspotsResult.value,
          homeRail: homeRailResult.value,
          tags: tagsResult.value
        },
        degraded
      }
    }
  }
}

export type PublicHomeBootstrapService = ReturnType<typeof createPublicHomeBootstrapService>
