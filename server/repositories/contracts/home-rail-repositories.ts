import type { HomeRailArticleSignal, HomeRailContentCounts } from '../../domain/home-rail'

export interface HomeRailReadRepository {
  getContentCounts(): Promise<HomeRailContentCounts>
  getLastPublicUpdate(): Promise<Date | null>
  listArticleSignals(since: Date, limit: number): Promise<HomeRailArticleSignal[]>
  listPublishedArticleSlugs(slugs: string[]): Promise<string[]>
}
