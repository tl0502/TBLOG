import { createAdminTaxonomyService } from '../../../server/services/admin-taxonomy-service'
import type {
  AdminCategory,
  AdminTag,
  AdminTaxonomyOption,
  AdminTaxonomyRepository,
  CreateCategoryInput,
  CreateTagInput,
  UpdateCategoryFields,
  UpdateTagFields
} from '../../../server/repositories/contracts/admin-taxonomy-repositories'
import type { CacheProvider } from '../../../server/providers/cache/cache-provider'
import { cacheKeys } from '../../../server/utils/cache-keys'
import { UNCATEGORIZED_CATEGORY_ID } from '../../../server/domain/taxonomy'

function categoryFixture(overrides: Partial<AdminCategory> = {}): AdminCategory {
  return {
    id: 'c1',
    name: 'C1',
    slug: 'c1',
    description: null,
    color: null,
    sortOrder: 0,
    isSystem: false,
    articleCount: 0,
    ...overrides
  }
}

function tagFixture(overrides: Partial<AdminTag> = {}): AdminTag {
  return {
    id: 't1',
    name: 'T1',
    slug: 't1',
    description: null,
    color: null,
    sortOrder: 0,
    articleCount: 0,
    ...overrides
  }
}

function pruneUndefined<T extends object>(fields: T): Partial<T> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<T>
}

function createFakeRepo(
  categorySeed: AdminCategory[] = [],
  tagSeed: AdminTag[] = [],
  tagOptions: AdminTaxonomyOption[] = [],
  affectedPostSlugs: { categories?: Record<string, string[]>; tags?: Record<string, string[]> } = {}
) {
  const categories = new Map(categorySeed.map((category) => [category.id, { ...category }]))
  const tags = new Map(tagSeed.map((tag) => [tag.id, { ...tag }]))
  const calls = {
    create: [] as CreateCategoryInput[],
    update: [] as Array<{ id: string; fields: UpdateCategoryFields }>,
    deleted: [] as Array<{ id: string; fallback: string }>,
    tagCreate: [] as CreateTagInput[],
    tagUpdate: [] as Array<{ id: string; fields: UpdateTagFields }>,
    tagDeleted: [] as string[],
    merged: [] as Array<{ sourceId: string; targetId: string }>
  }
  const repository: AdminTaxonomyRepository = {
    async listCategoryOptions() {
      return [...categories.values()].map((category) => ({ id: category.id, name: category.name }))
    },
    async listTagOptions() {
      return tagOptions
    },
    async listCategoriesWithCounts() {
      return [...categories.values()]
    },
    async findCategoryById(id) {
      const category = categories.get(id)
      return category ? { ...category } : null
    },
    async findCategoryBySlug(slug) {
      const found = [...categories.values()].find((category) => category.slug === slug)
      return found ? { id: found.id } : null
    },
    async listPublishedPostSlugsByCategoryId(id) {
      return affectedPostSlugs.categories?.[id] ?? []
    },
    async createCategory(input) {
      calls.create.push(input)
      categories.set(input.id, categoryFixture({ ...input, articleCount: 0, isSystem: false }))
    },
    async updateCategory(id, fields) {
      calls.update.push({ id, fields })
      const category = categories.get(id)
      if (category) Object.assign(category, pruneUndefined(fields))
    },
    async deleteCategoryReassigning(id, fallbackCategoryId) {
      calls.deleted.push({ id, fallback: fallbackCategoryId })
      categories.delete(id)
    },
    async listTagsWithCounts() {
      return [...tags.values()]
    },
    async findTagById(id) {
      const tag = tags.get(id)
      return tag ? { ...tag } : null
    },
    async findTagBySlug(slug) {
      const found = [...tags.values()].find((tag) => tag.slug === slug)
      return found ? { id: found.id } : null
    },
    async listPublishedPostSlugsByTagIds(ids) {
      return [...new Set(ids.flatMap((id) => affectedPostSlugs.tags?.[id] ?? []))]
    },
    async createTag(input) {
      calls.tagCreate.push(input)
      tags.set(input.id, tagFixture({ ...input, articleCount: 0 }))
    },
    async updateTag(id, fields) {
      calls.tagUpdate.push({ id, fields })
      const tag = tags.get(id)
      if (tag) Object.assign(tag, pruneUndefined(fields))
    },
    async deleteTag(id) {
      calls.tagDeleted.push(id)
      tags.delete(id)
    },
    async mergeTags(sourceId, targetId) {
      calls.merged.push({ sourceId, targetId })
      tags.delete(sourceId)
    }
  }
  return { repository, categories, tags, calls }
}

function build(
  categorySeed: AdminCategory[] = [],
  tagSeed: AdminTag[] = [],
  tagOptions: AdminTaxonomyOption[] = [],
  affectedPostSlugs: { categories?: Record<string, string[]>; tags?: Record<string, string[]> } = {}
) {
  const parts = createFakeRepo(categorySeed, tagSeed, tagOptions, affectedPostSlugs)
  const invalidated: string[][] = []
  const cache: CacheProvider = {
    async get() {
      return null
    },
    async set() {},
    async delete(keys) {
      invalidated.push(keys)
    }
  }
  const service = createAdminTaxonomyService({
    adminTaxonomyRepository: parts.repository,
    cache,
    generateId: () => 'new-id'
  })
  return { service, invalidated, ...parts }
}

describe('admin taxonomy service', () => {
  it('returns editor taxonomy options from the repository', async () => {
    const { service } = build(
      [categoryFixture({ id: 'cat1', name: 'Engineering', slug: 'engineering' })],
      [],
      [{ id: 'tag1', name: 'Nuxt' }]
    )

    await expect(service.getOptions()).resolves.toEqual({
      categories: [{ id: 'cat1', name: 'Engineering' }],
      tags: [{ id: 'tag1', name: 'Nuxt' }]
    })
  })

  it('creates a category, deriving the slug from the name', async () => {
    const { service, calls } = build()

    const created = await service.createCategory({ name: 'Cloud Native' })

    expect(calls.create[0]).toMatchObject({ id: 'new-id', name: 'Cloud Native', slug: 'cloud-native' })
    expect(created).toMatchObject({ id: 'new-id', slug: 'cloud-native' })
  })

  it('rejects a duplicate category slug', async () => {
    const { service } = build([categoryFixture({ id: 'c1', slug: 'taken' })])

    await expect(
      service.createCategory({ name: 'X', slug: 'taken' })
    ).rejects.toMatchObject({ code: 'slug_conflict', statusCode: 409 })
  })

  it('rejects a category name that cannot form a slug', async () => {
    const { service } = build()

    await expect(
      service.createCategory({ name: '关于' })
    ).rejects.toMatchObject({ code: 'invalid_slug', statusCode: 422 })
  })

  it('updates a category and re-derives an explicit slug', async () => {
    const { service, calls } = build([categoryFixture({ id: 'c1', name: 'Old', slug: 'old' })])

    await service.updateCategory('c1', { name: 'New', slug: 'New Slug' })

    expect(calls.update[0]).toMatchObject({ id: 'c1', fields: { name: 'New', slug: 'new-slug' } })
  })

  it('throws not_found updating a missing category', async () => {
    const { service } = build()

    await expect(service.updateCategory('nope', { name: 'X' })).rejects.toMatchObject({
      code: 'not_found',
      statusCode: 404
    })
  })

  it('refuses to delete the system 未分类 category', async () => {
    const { service, calls } = build([
      categoryFixture({ id: UNCATEGORIZED_CATEGORY_ID, name: '未分类', slug: 'uncategorized', isSystem: true })
    ])

    await expect(service.deleteCategory(UNCATEGORIZED_CATEGORY_ID)).rejects.toMatchObject({
      code: 'category_protected',
      statusCode: 409
    })
    expect(calls.deleted).toHaveLength(0)
  })

  it('deletes a category, reassigning its posts to 未分类', async () => {
    const { service, calls } = build([categoryFixture({ id: 'c1' })])

    await service.deleteCategory('c1')

    expect(calls.deleted).toEqual([{ id: 'c1', fallback: UNCATEGORIZED_CATEGORY_ID }])
  })

  it('throws not_found deleting a missing category', async () => {
    const { service } = build()

    await expect(service.deleteCategory('nope')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('creates a tag, deriving the slug from the name', async () => {
    const { service, calls } = build()

    const created = await service.createTag({ name: 'Edge Runtime' })

    expect(calls.tagCreate[0]).toMatchObject({ id: 'new-id', name: 'Edge Runtime', slug: 'edge-runtime' })
    expect(created).toMatchObject({ id: 'new-id', slug: 'edge-runtime' })
  })

  it('rejects a duplicate tag slug', async () => {
    const { service } = build([], [tagFixture({ id: 't1', slug: 'taken' })])

    await expect(
      service.createTag({ name: 'X', slug: 'taken' })
    ).rejects.toMatchObject({ code: 'slug_conflict', statusCode: 409 })
  })

  it('deletes an existing tag', async () => {
    const { service, calls } = build([], [tagFixture({ id: 't1' })])

    await service.deleteTag('t1')

    expect(calls.tagDeleted).toEqual(['t1'])
  })

  it('throws not_found deleting a missing tag', async () => {
    const { service } = build()

    await expect(service.deleteTag('nope')).rejects.toMatchObject({ code: 'not_found', statusCode: 404 })
  })

  it('merges one tag into another when both exist', async () => {
    const { service, calls } = build([], [tagFixture({ id: 'src' }), tagFixture({ id: 'dst', slug: 'dst' })])

    await service.mergeTags('src', 'dst')

    expect(calls.merged).toEqual([{ sourceId: 'src', targetId: 'dst' }])
  })

  it('refuses to merge a tag into itself', async () => {
    const { service, calls } = build([], [tagFixture({ id: 't1' })])

    await expect(service.mergeTags('t1', 't1')).rejects.toMatchObject({
      code: 'invalid_merge',
      statusCode: 422
    })
    expect(calls.merged).toHaveLength(0)
  })

  it('throws not_found merging when the target tag is missing', async () => {
    const { service, calls } = build([], [tagFixture({ id: 'src' })])

    await expect(service.mergeTags('src', 'missing')).rejects.toMatchObject({ code: 'not_found' })
    expect(calls.merged).toHaveLength(0)
  })

  it('invalidates public taxonomy caches when creating a category', async () => {
    const { service, invalidated } = build()

    await service.createCategory({ name: 'Cloud Native' })

    expect(invalidated).toEqual([
      [
        cacheKeys.category('new-id'),
        cacheKeys.featuredPost(),
        cacheKeys.hotspots(),
        cacheKeys.home(),
        cacheKeys.archive(),
        cacheKeys.rss(),
        cacheKeys.sitemap()
      ]
    ])
  })

  it('invalidates public taxonomy caches when renaming a category', async () => {
    const { service, invalidated } = build(
      [categoryFixture({ id: 'c1', name: 'Old', slug: 'old' })],
      [],
      [],
      { categories: { c1: ['published-post'] } }
    )

    await service.updateCategory('c1', { slug: 'new-slug' })

    expect(invalidated).toEqual([
      [
        cacheKeys.category('c1'),
        cacheKeys.postSlug('published-post'),
        cacheKeys.featuredPost(),
        cacheKeys.hotspots(),
        cacheKeys.home(),
        cacheKeys.archive(),
        cacheKeys.rss(),
        cacheKeys.sitemap()
      ]
    ])
  })

  it('invalidates public taxonomy caches when deleting a category', async () => {
    const { service, invalidated } = build(
      [categoryFixture({ id: 'c1' })],
      [],
      [],
      { categories: { c1: ['reassigned-post'] } }
    )

    await service.deleteCategory('c1')

    expect(invalidated).toEqual([
      [
        cacheKeys.category('c1'),
        cacheKeys.category(UNCATEGORIZED_CATEGORY_ID),
        cacheKeys.postSlug('reassigned-post'),
        cacheKeys.featuredPost(),
        cacheKeys.hotspots(),
        cacheKeys.home(),
        cacheKeys.archive(),
        cacheKeys.rss(),
        cacheKeys.sitemap()
      ]
    ])
  })

  it('invalidates public taxonomy caches when creating a tag', async () => {
    const { service, invalidated } = build()

    await service.createTag({ name: 'Edge Runtime' })

    expect(invalidated).toEqual([
      [
        cacheKeys.tag('new-id'),
        cacheKeys.featuredPost(),
        cacheKeys.hotspots(),
        cacheKeys.home(),
        cacheKeys.archive(),
        cacheKeys.rss(),
        cacheKeys.sitemap()
      ]
    ])
  })

  it('invalidates both tag pages when merging tags', async () => {
    const { service, invalidated } = build(
      [],
      [tagFixture({ id: 'src' }), tagFixture({ id: 'dst', slug: 'dst' })],
      [],
      { tags: { src: ['source-post', 'shared-post'], dst: ['shared-post', 'target-post'] } }
    )

    await service.mergeTags('src', 'dst')

    expect(invalidated).toEqual([
      [
        cacheKeys.tag('src'),
        cacheKeys.tag('dst'),
        cacheKeys.postSlug('source-post'),
        cacheKeys.postSlug('shared-post'),
        cacheKeys.postSlug('target-post'),
        cacheKeys.featuredPost(),
        cacheKeys.hotspots(),
        cacheKeys.home(),
        cacheKeys.archive(),
        cacheKeys.rss(),
        cacheKeys.sitemap()
      ]
    ])
  })

  it('invalidates affected post details when updating or deleting a tag', async () => {
    const updated = build(
      [],
      [tagFixture({ id: 't1' })],
      [],
      { tags: { t1: ['tagged-post'] } }
    )
    await updated.service.updateTag('t1', { name: 'Renamed' })
    expect(updated.invalidated[0]).toContain(cacheKeys.postSlug('tagged-post'))

    const deleted = build(
      [],
      [tagFixture({ id: 't1' })],
      [],
      { tags: { t1: ['tagged-post'] } }
    )
    await deleted.service.deleteTag('t1')
    expect(deleted.invalidated[0]).toContain(cacheKeys.postSlug('tagged-post'))
  })
})
