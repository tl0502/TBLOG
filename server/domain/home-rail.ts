export interface HomeRailContentCounts {
  articles: number
  categories: number
  tags: number
}

export interface HomeRailArticleSignal {
  slug: string
  title: string
  publishedAt: Date
  updatedAt: Date
}

export interface HomeRailCardDynamicData {
  contentStats?: {
    articles: number
    categories: number
    tags: number
    pageViews: number | null
  } | null
  siteHistory?: {
    startDate: string | null
    daysRunning: number | null
    lastUpdatedAt: string | null
  } | null
  publishingRhythm?: Array<{ weekStart: string; count: number }>
  curatedTopicArticleCount?: number | null
  siteActivity?: Array<{
    date: string
    title: string
    detail: string
    url: string | null
    source: 'published' | 'updated' | 'manual'
  }>
}

export interface HomeRailDynamicData {
  cards: Record<string, HomeRailCardDynamicData>
}
