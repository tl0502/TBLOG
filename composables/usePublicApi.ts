import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type {
  ArchiveGroupView,
  ArticleListItemView,
  HomeBootstrapView,
  HotspotsView,
  HomeRailDataView,
  PostDetailView,
  PublicCommentView,
  TaxonomyView
} from '~/types/public-view'
import type { HomeFeedMeta, HomeFeedSort, SortOrder } from '~/types/home-feed'
import { publicResourceKey, useStaleFirstPublicResource } from '~/composables/useStaleFirstPublicResource'

interface ListMeta {
  nextCursor: string | null
}

export interface Envelope<TData, TMeta = Record<string, unknown>> {
  data: TData
  meta: TMeta
}

export interface PostListQuery {
  cursor?: string
  limit?: number
}

export interface SubmitCommentBody {
  nickname: string
  email?: string
  content: string
  protectionToken?: string
  parentCommentId?: string
}

export interface HomeFeedQuery {
  page: number
  limit: number
  sort: HomeFeedSort
  order: SortOrder
}

export type HomeBootstrapDegradedSection = 'featured' | 'hotspots' | 'homeRail' | 'tags'

export function usePostFeed(query: MaybeRefOrGetter<HomeFeedQuery>) {
  const resolvedQuery = computed(() => toValue(query))
  return useStaleFirstPublicResource<Envelope<ArticleListItemView[], HomeFeedMeta>>('/api/v1/posts', {
    key: computed(() => publicResourceKey('posts', resolvedQuery.value)),
    query: resolvedQuery
  })
}

export function useHomeBootstrap(query: MaybeRefOrGetter<HomeFeedQuery>) {
  const resolvedQuery = computed(() => toValue(query))
  return useStaleFirstPublicResource<Envelope<HomeBootstrapView, { degraded: HomeBootstrapDegradedSection[] }>>('/api/v1/home', {
    key: computed(() => publicResourceKey('home', resolvedQuery.value)),
    query: resolvedQuery
  })
}

export function useFeaturedPosts() {
  return useStaleFirstPublicResource<Envelope<ArticleListItemView[]>>('/api/v1/featured-posts', {
    key: publicResourceKey('featured-posts')
  })
}

export function useHotspots() {
  return useStaleFirstPublicResource<Envelope<HotspotsView, { currentDays: number; retentionDays: number }>>('/api/v1/hotspots', {
    key: publicResourceKey('hotspots')
  })
}

export function useHomeRailData() {
  return useStaleFirstPublicResource<Envelope<HomeRailDataView>>('/api/v1/home-rail', {
    key: publicResourceKey('home-rail')
  })
}

export function usePostDetail(slug: MaybeRefOrGetter<string>) {
  return useStaleFirstPublicResource<Envelope<PostDetailView>>(
    () => `/api/v1/posts/${toValue(slug)}`,
    { key: computed(() => publicResourceKey(`posts/${toValue(slug)}`)) }
  )
}

export function usePostComments(
  slug: MaybeRefOrGetter<string>,
  query: MaybeRefOrGetter<PostListQuery> = { limit: 20 }
) {
  const resolvedQuery = computed(() => toValue(query))
  return useStaleFirstPublicResource<Envelope<PublicCommentView[], ListMeta>>(
    () => `/api/v1/posts/${toValue(slug)}/comments`,
    {
      key: computed(() => publicResourceKey(`posts/${toValue(slug)}/comments`, resolvedQuery.value)),
      query: resolvedQuery,
      server: false
    }
  )
}

export function fetchPostComments(slug: string, query: PostListQuery = { limit: 20 }) {
  return $fetch<Envelope<PublicCommentView[], ListMeta>>(
    `/api/v1/posts/${slug}/comments`,
    { query }
  )
}

export function submitComment(slug: string, body: SubmitCommentBody) {
  return $fetch<Envelope<{ id: string; status: 'pending' | 'approved' | 'rejected' }>>(`/api/v1/posts/${slug}/comments`, {
    method: 'POST',
    body
  })
}

export function useCategories() {
  return useStaleFirstPublicResource<Envelope<TaxonomyView[]>>('/api/v1/categories', {
    key: publicResourceKey('categories')
  })
}

export function useCategoryDetail(
  slug: MaybeRefOrGetter<string>,
  query: MaybeRefOrGetter<PostListQuery> = {}
) {
  const resolvedQuery = computed(() => toValue(query))
  return useStaleFirstPublicResource<Envelope<{ category: TaxonomyView; items: ArticleListItemView[] }, ListMeta>>(
    () => `/api/v1/categories/${toValue(slug)}`,
    {
      key: computed(() => publicResourceKey(`categories/${toValue(slug)}`, resolvedQuery.value)),
      query: resolvedQuery
    }
  )
}


export function fetchCategoryDetail(slug: string, query: PostListQuery = {}) {
  return $fetch<Envelope<{ category: TaxonomyView; items: ArticleListItemView[] }, ListMeta>>(
    `/api/v1/categories/${slug}`,
    { query }
  )
}

export function useTags() {
  return useStaleFirstPublicResource<Envelope<TaxonomyView[]>>('/api/v1/tags', {
    key: publicResourceKey('tags')
  })
}

export function useTagDetail(
  slug: MaybeRefOrGetter<string>,
  query: MaybeRefOrGetter<PostListQuery> = {}
) {
  const resolvedQuery = computed(() => toValue(query))
  return useStaleFirstPublicResource<Envelope<{ tag: TaxonomyView; items: ArticleListItemView[] }, ListMeta>>(
    () => `/api/v1/tags/${toValue(slug)}`,
    {
      key: computed(() => publicResourceKey(`tags/${toValue(slug)}`, resolvedQuery.value)),
      query: resolvedQuery
    }
  )
}

export function fetchTagDetail(slug: string, query: PostListQuery = {}) {
  return $fetch<Envelope<{ tag: TaxonomyView; items: ArticleListItemView[] }, ListMeta>>(
    `/api/v1/tags/${slug}`,
    { query }
  )
}

export function useArchive() {
  return useStaleFirstPublicResource<Envelope<ArchiveGroupView[]>>('/api/v1/archive', {
    key: publicResourceKey('archive')
  })
}
