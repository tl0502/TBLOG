import { homeRailCardCatalogDefaults, type HomeRailCard } from '~/types/settings'

export const homeRailCardLabels: Record<HomeRailCard['type'], string> = {
  tags: '标签卡片',
  'build-log': '构建日志卡片',
  'content-stats': '内容概览统计',
  'site-history': '站点历程统计',
  'publishing-rhythm': '发布节奏统计',
  'friend-links': '友情链接',
  navigation: '导航入口',
  'curated-topic': '专题策展',
  'reading-series': '系列阅读',
  'site-activity': '站点动态'
}

export function createHomeRailCard(type: HomeRailCard['type']): HomeRailCard {
  const card = homeRailCardCatalogDefaults.find((item) => item.type === type)
  if (!card) throw new Error(`Unknown Home Rail card type: ${type}`)
  return { ...structuredClone(card), instanceId: crypto.randomUUID(), enabled: true } as HomeRailCard
}
