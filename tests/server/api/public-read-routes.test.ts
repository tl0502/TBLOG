import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getQuery, getRouterParam } from 'h3'
import {
  createPublicContentServiceForEvent,
  createTaxonomyReadServiceForEvent
} from '../../../server/services/public-read-service-factory'
import { publicReadError } from '../../../server/domain/public-read-errors'

// Nitro auto-imports `defineEventHandler` at runtime; shim it before the route
// modules evaluate so their default export is the bare `(event) => ...` handler.
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

// Keep h3 real except for the two request-input readers, so `setResponseStatus`,
// `setResponseHeader`, and `getRequestHeader` still operate on the fake event.
vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return { ...actual, getQuery: vi.fn(), getRouterParam: vi.fn() }
})

// Stub the service factory so handlers run without a D1 binding; this isolates
// the controller layer (validation, error mapping, envelope, cache headers).
vi.mock('../../../server/services/public-read-service-factory', () => ({
  createPublicContentServiceForEvent: vi.fn(),
  createTaxonomyReadServiceForEvent: vi.fn()
}))

import postsIndex from '../../../server/api/v1/posts/index.get'
import postsSlug from '../../../server/api/v1/posts/[slug].get'
import categoriesIndex from '../../../server/api/v1/categories/index.get'
import categoriesSlug from '../../../server/api/v1/categories/[slug].get'
import tagsIndex from '../../../server/api/v1/tags/index.get'
import tagsSlug from '../../../server/api/v1/tags/[slug].get'
import archiveRoute from '../../../server/api/v1/archive.get'
import featuredPostsRoute from '../../../server/api/v1/featured-posts/index.get'

const CACHE_CONTROL = 'no-store'

const listItem = {
  id: 'a',
  slug: 'a',
  title: 'A',
  excerpt: null,
  readingTime: 1,
  publishedAt: new Date('2026-06-01T00:00:00.000Z'),
  category: null,
  tags: []
}

type Handler = (event: unknown) => Promise<unknown>

function makeEvent() {
  const headers: Record<string, string> = {}
  const event = {
    node: {
      req: { headers: {} as Record<string, string> },
      res: { statusCode: 200, setHeader: (key: string, value: string) => { headers[key] = value } }
    },
    context: {}
  }
  return { event, headers }
}

function contentService(impl: Record<string, unknown>) {
  vi.mocked(createPublicContentServiceForEvent).mockReturnValue(impl as never)
}

function taxonomyService(impl: Record<string, unknown>) {
  vi.mocked(createTaxonomyReadServiceForEvent).mockReturnValue(impl as never)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('public read route handlers', () => {
  it('GET /featured-posts returns effective public carousel articles with cache headers', async () => {
    const getFeaturedPosts = vi.fn().mockResolvedValue([listItem])
    contentService({ getFeaturedPosts })
    const { event, headers } = makeEvent()

    const body = await (featuredPostsRoute as Handler)(event)

    expect(body).toEqual({ data: [listItem], meta: {} })
    expect(headers['Cache-Control']).toBe(CACHE_CONTROL)
  })

  it('GET /posts returns the list envelope with pagination meta and cache headers', async () => {
    vi.mocked(getQuery).mockReturnValue({})
    const getHomeFeed = vi.fn().mockResolvedValue({
      items: [listItem], page: 1, pageSize: 25, total: 1, pageCount: 1, sort: 'publishedAt', order: 'desc'
    })
    contentService({ getHomeFeed })
    const { event, headers } = makeEvent()

    const body = (await (postsIndex as Handler)(event)) as Record<string, unknown>

    expect(body).toEqual({
      data: [listItem],
      meta: { page: 1, pageSize: 25, total: 1, pageCount: 1, sort: 'publishedAt', order: 'desc' }
    })
    expect(getHomeFeed).toHaveBeenCalledWith({ page: 1, limit: 25, sort: 'publishedAt', order: 'desc' })
    expect(headers['Cache-Control']).toBe(CACHE_CONTROL)
    expect(event.node.res.statusCode).toBe(200)
  })

  it('GET /posts maps invalid pagination to a 400 invalid_pagination error and sends no cache header', async () => {
    vi.mocked(getQuery).mockReturnValue({ limit: '999' })
    contentService({ getHomeFeed: vi.fn() })
    const { event, headers } = makeEvent()

    const body = (await (postsIndex as Handler)(event)) as { error: { code: string } }

    expect(event.node.res.statusCode).toBe(400)
    expect(body).toMatchObject({ error: { code: 'invalid_pagination' } })
    expect(headers['Cache-Control']).toBeUndefined()
  })

  it('GET /posts rejects an unknown sort instead of returning the default page', async () => {
    vi.mocked(getQuery).mockReturnValue({ sort: 'comments' })
    const getHomeFeed = vi.fn()
    contentService({ getHomeFeed })
    const { event } = makeEvent()

    const body = (await (postsIndex as Handler)(event)) as { error: { code: string } }

    expect(event.node.res.statusCode).toBe(400)
    expect(body).toMatchObject({ error: { code: 'invalid_pagination' } })
    expect(getHomeFeed).not.toHaveBeenCalled()
  })

  it('GET /posts/:slug returns only public detail fields with no markdown/processing leakage', async () => {
    vi.mocked(getRouterParam).mockReturnValue('a')
    const detail = {
      ...listItem,
      type: 'article',
      html: '<h1>A</h1>',
      tocJson: null,
      codeMeta: [],
      cover: null,
      seoTitle: 'SEO A',
      seoDescription: null,
      canonicalUrlOverride: null,
      openGraphImageUrl: null,
      twitterImageUrl: null,
      jsonLdOverrideJson: null
    }
    const getPostDetail = vi.fn().mockResolvedValue(detail)
    contentService({ getPostDetail })
    const { event, headers } = makeEvent()

    const body = (await (postsSlug as Handler)(event)) as { data: Record<string, unknown> }

    expect(body).toEqual({ data: detail, meta: {} })
    expect(Object.keys(body.data).sort()).toEqual(
      [
        'category', 'excerpt', 'html', 'id', 'publishedAt', 'readingTime', 'slug', 'tags', 'title',
        'tocJson', 'type', 'codeMeta', 'cover', 'seoTitle', 'seoDescription', 'canonicalUrlOverride',
        'openGraphImageUrl', 'twitterImageUrl', 'jsonLdOverrideJson'
      ].sort()
    )
    expect(body.data).not.toHaveProperty('markdown')
    expect(body.data).not.toHaveProperty('processingState')
    expect(body.data).not.toHaveProperty('authorId')
    expect(headers['Cache-Control']).toBe(CACHE_CONTROL)
  })

  it('GET /posts/:slug maps a not_found domain error to 404', async () => {
    vi.mocked(getRouterParam).mockReturnValue('missing')
    const getPostDetail = vi.fn().mockRejectedValue(publicReadError('not_found', 'Post not found', 404))
    contentService({ getPostDetail })
    const { event } = makeEvent()

    const body = (await (postsSlug as Handler)(event)) as { error: { code: string } }

    expect(event.node.res.statusCode).toBe(404)
    expect(body).toMatchObject({ error: { code: 'not_found' } })
  })

  it('GET /posts/:slug maps an invalid (empty) slug to 404', async () => {
    vi.mocked(getRouterParam).mockReturnValue('')
    contentService({ getPostDetail: vi.fn() })
    const { event } = makeEvent()

    const body = (await (postsSlug as Handler)(event)) as { error: { code: string } }

    expect(event.node.res.statusCode).toBe(404)
    expect(body).toMatchObject({ error: { code: 'not_found' } })
  })

  it('GET /categories returns the taxonomy list envelope with cache headers', async () => {
    const category = { slug: 'c', name: 'C', description: null, color: null, articleCount: 2 }
    const getCategories = vi.fn().mockResolvedValue([category])
    taxonomyService({ getCategories })
    const { event, headers } = makeEvent()

    const body = (await (categoriesIndex as Handler)(event)) as Record<string, unknown>

    expect(body).toEqual({ data: [category], meta: {} })
    expect(headers['Cache-Control']).toBe(CACHE_CONTROL)
  })

  it('GET /categories/:slug returns category + items with pagination meta', async () => {
    vi.mocked(getRouterParam).mockReturnValue('c')
    vi.mocked(getQuery).mockReturnValue({})
    const category = { slug: 'c', name: 'C', description: null, color: null, articleCount: 1 }
    const getCategoryDetail = vi.fn().mockResolvedValue({ category, articles: { items: [listItem], nextCursor: null } })
    taxonomyService({ getCategoryDetail })
    const { event } = makeEvent()

    const body = (await (categoriesSlug as Handler)(event)) as Record<string, unknown>

    expect(body).toEqual({ data: { category, items: [listItem] }, meta: { nextCursor: null } })
    expect(getCategoryDetail).toHaveBeenCalledWith('c', { limit: 20 })
  })

  it('GET /categories/:slug maps a not_found domain error to 404', async () => {
    vi.mocked(getRouterParam).mockReturnValue('nope')
    vi.mocked(getQuery).mockReturnValue({})
    const getCategoryDetail = vi.fn().mockRejectedValue(publicReadError('not_found', 'Category not found', 404))
    taxonomyService({ getCategoryDetail })
    const { event } = makeEvent()

    const body = (await (categoriesSlug as Handler)(event)) as { error: { code: string } }

    expect(event.node.res.statusCode).toBe(404)
    expect(body).toMatchObject({ error: { code: 'not_found' } })
  })

  it('GET /tags returns the taxonomy list envelope', async () => {
    const tag = { slug: 't', name: 'T', description: null, color: null, articleCount: 0 }
    const getTags = vi.fn().mockResolvedValue([tag])
    taxonomyService({ getTags })
    const { event } = makeEvent()

    const body = (await (tagsIndex as Handler)(event)) as Record<string, unknown>

    expect(body).toEqual({ data: [tag], meta: {} })
  })

  it('GET /tags/:slug returns tag + items and forwards the validated limit', async () => {
    vi.mocked(getRouterParam).mockReturnValue('t')
    vi.mocked(getQuery).mockReturnValue({ limit: '5' })
    const tag = { slug: 't', name: 'T', description: null, color: null, articleCount: 1 }
    const getTagDetail = vi.fn().mockResolvedValue({ tag, articles: { items: [listItem], nextCursor: 'n' } })
    taxonomyService({ getTagDetail })
    const { event } = makeEvent()

    const body = (await (tagsSlug as Handler)(event)) as Record<string, unknown>

    expect(body).toEqual({ data: { tag, items: [listItem] }, meta: { nextCursor: 'n' } })
    expect(getTagDetail).toHaveBeenCalledWith('t', { limit: 5 })
  })

  it('GET /archive returns the grouped archive with cache headers', async () => {
    const getArchive = vi.fn().mockResolvedValue([{ year: 2026, month: 6, items: [listItem] }])
    contentService({ getArchive })
    const { event, headers } = makeEvent()

    const body = (await (archiveRoute as Handler)(event)) as Record<string, unknown>

    expect(body).toEqual({ data: [{ year: 2026, month: 6, items: [listItem] }], meta: {} })
    expect(headers['Cache-Control']).toBe(CACHE_CONTROL)
  })
})
