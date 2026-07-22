import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick, reactive, ref, shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  fetchCategoryDetail: vi.fn(),
  fetchTagDetail: vi.fn(),
  useCategoryDetail: vi.fn(),
  useTagDetail: vi.fn()
}))

vi.mock('~/composables/usePublicApi', () => api)
vi.mock('~/composables/useSeo', () => ({ useBasicPageSeo: vi.fn() }))
vi.mock('~/composables/useTblogI18n', () => ({ useTblogI18n: () => ({ t: (key: string) => key }) }))

const TaxonomyDetailStub = defineComponent({
  props: {
    articles: { type: Array, required: true },
    hasMore: Boolean
  },
  emits: ['loadMore'],
  template: `
    <section>
      <p v-for="article in articles" :key="article.id" data-test="article">{{ article.title }}</p>
      <button v-if="hasMore" data-test="load-more" @click="$emit('loadMore')">Load more</button>
    </section>
  `
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function article(id: string, title: string) {
  return {
    id,
    slug: id,
    title,
    cover: null,
    excerpt: null,
    readingTime: 1,
    publishedAt: '2026-07-01T00:00:00.000Z',
    category: null,
    tags: []
  }
}

function response(kind: 'category' | 'tag', slug: string, items: unknown[], nextCursor: string | null) {
  return {
    data: {
      [kind]: { slug, name: slug, description: null, color: null, articleCount: items.length },
      items
    },
    meta: { nextCursor }
  }
}

interface TaxonomyCase {
  kind: 'category' | 'tag'
  slug: string
  use: 'useCategoryDetail' | 'useTagDetail'
  fetch: 'fetchCategoryDetail' | 'fetchTagDetail'
  path: string
}

const cases: TaxonomyCase[] = [
  { kind: 'category' as const, slug: 'engineering', use: 'useCategoryDetail', fetch: 'fetchCategoryDetail', path: '../../pages/categories/[slug].vue' },
  { kind: 'tag' as const, slug: 'vue', use: 'useTagDetail', fetch: 'fetchTagDetail', path: '../../pages/tags/[slug].vue' }
]

async function mountPage(testCase: TaxonomyCase, initial: ReturnType<typeof response>) {
  const state = shallowRef(initial)
  api[testCase.use].mockReturnValue({ data: state, error: ref(null) })
  const page = (await import(testCase.path)).default
  const Host = defineComponent({ components: { Page: page }, template: '<Suspense><Page /></Suspense>' })
  const wrapper = mount(Host, { global: { stubs: { TaxonomyDetail: TaxonomyDetailStub } } })
  await flushPromises()
  return { wrapper, state }
}

function titles(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[data-test="article"]').map((node) => node.text())
}

describe.each(cases)('$kind detail pagination', (testCase) => {
  beforeEach(() => {
    vi.clearAllMocks()
    const route = reactive({ params: { slug: testCase.slug } })
    vi.stubGlobal('useRoute', () => route)
    vi.stubGlobal('definePageMeta', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps appended pages when a same-resource refresh arrives afterwards', async () => {
    const first = response(testCase.kind, testCase.slug, [article('1', 'First')], 'cursor-1')
    const pageTwo = response(testCase.kind, testCase.slug, [article('2', 'Second')], null)
    const { wrapper, state } = await mountPage(testCase, first)
    api[testCase.fetch].mockResolvedValueOnce(pageTwo)

    await wrapper.get('[data-test="load-more"]').trigger('click')
    await flushPromises()
    expect(titles(wrapper)).toEqual(['First', 'Second'])

    state.value = response(testCase.kind, testCase.slug, [article('1', 'Fresh first')], 'cursor-new')
    await nextTick()
    expect(titles(wrapper)).toEqual(['First', 'Second'])
    wrapper.unmount()
  })

  it('discards a loadMore response from the previous generation when refresh wins the race', async () => {
    const first = response(testCase.kind, testCase.slug, [article('1', 'First')], 'cursor-1')
    const pending = deferred<ReturnType<typeof response>>()
    const { wrapper, state } = await mountPage(testCase, first)
    api[testCase.fetch].mockReturnValueOnce(pending.promise)

    await wrapper.get('[data-test="load-more"]').trigger('click')
    state.value = response(testCase.kind, testCase.slug, [article('3', 'Fresh first')], 'cursor-new')
    await nextTick()

    pending.resolve(response(testCase.kind, testCase.slug, [article('2', 'Old second')], null))
    await flushPromises()
    expect(titles(wrapper)).toEqual(['Fresh first'])
    wrapper.unmount()
  })
})
