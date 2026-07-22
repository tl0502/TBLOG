import { createSSRApp, defineComponent, shallowRef } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { Window } from 'happy-dom'
import type { PostDetailView } from '../../types/public-view'

const api = vi.hoisted(() => ({
  usePostDetail: vi.fn(),
  usePostComments: vi.fn(),
  submitComment: vi.fn()
}))

const siteConfig = vi.hoisted(() => ({
  enabled: true
}))

vi.mock('~/composables/usePublicApi', () => api)
vi.mock('~/composables/useSiteConfig', () => ({
  useOptionalPublicSiteConfigData: () => shallowRef({
    data: { comment: { enabled: siteConfig.enabled, protection: null } },
    meta: {}
  })
}))

// The post page injects article SEO on the success path; stub it so this island test can render
// without Nuxt's head/runtime composables.
vi.mock('~/composables/useSeo', () => ({ useArticleSeo: vi.fn() }))

vi.stubGlobal('useRoute', () => ({ params: { slug: 'post-one' } }))
vi.stubGlobal('definePageMeta', vi.fn())
vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string; fatal: boolean }) => (
  Object.assign(new Error(input.statusMessage), input)
))

const ClientOnlyStub = defineComponent({
  template: '<div data-test="client-only"><slot /></div>'
})

const NuxtLinkStub = defineComponent({
  props: {
    to: {
      type: String,
      required: true
    }
  },
  template: '<a :href="to"><slot /></a>'
})

function makePost(type: 'article' | 'page'): PostDetailView {
  return {
    id: `${type}-1`,
    slug: 'post-one',
    type,
    title: type === 'article' ? 'Article post' : 'Standalone page',
    excerpt: null,
    readingTime: 2,
    publishedAt: '2026-07-01T00:00:00.000Z',
    category: null,
    tags: [],
    html: '<p>Stored article body.</p>',
    tocJson: null,
    codeMeta: [],
    cover: null,
    seoTitle: null,
    seoDescription: null,
    canonicalUrlOverride: null,
    openGraphImageUrl: null,
    twitterImageUrl: null,
    jsonLdOverrideJson: null
  }
}

async function renderPost(type: 'article' | 'page') {
  api.usePostDetail.mockReturnValue({
    data: shallowRef({ data: makePost(type), meta: {} }),
    error: shallowRef(null)
  })
  api.usePostComments.mockReturnValue({
    data: shallowRef({ data: [], meta: {} }),
    pending: shallowRef(false),
    error: shallowRef(null)
  })

  const page = await import('../../pages/posts/[slug].vue')
  const app = createSSRApp(page.default)
  app.component('ClientOnly', ClientOnlyStub)
  app.component('NuxtLink', NuxtLinkStub)
  return renderToString(app)
}

beforeEach(() => {
  vi.resetAllMocks()
  siteConfig.enabled = true
})

describe('post comments client island', () => {
  it('renders a visibility-gated comment island inside ClientOnly for article posts', async () => {
    const html = await renderPost('article')
    const window = new Window()
    window.document.body.innerHTML = html
    const stage = window.document.querySelector('.post-detail__stage')
    const article = window.document.querySelector('.post-detail__article')
    const hero = window.document.querySelector('.article-hero')
    const readingFrame = window.document.querySelector('.post-detail__reading-frame')
    const content = window.document.querySelector('.post-detail__content')
    const railSlot = window.document.querySelector('.post-detail__rail-slot')
    const comments = window.document.querySelector('.post-detail__comments')

    expect(html).toContain('data-test="client-only"')
    expect(html).toContain('data-test="lazy-comment-section"')
    expect(html).not.toContain('class="comment-section"')
    expect(stage).not.toBeNull()
    expect(article).not.toBeNull()
    expect(readingFrame).not.toBeNull()
    expect(comments).not.toBeNull()
    if (!stage || !article || !hero || !readingFrame || !content || !railSlot || !comments) {
      throw new Error('Expected article page layout containers')
    }
    expect(article.children[0]).toBe(hero)
    expect(article.children[1]).toBe(readingFrame)
    expect(readingFrame.children[0]).toBe(content)
    expect(readingFrame.children[1]).toBe(railSlot)
    expect(stage.querySelector('.assist-rail')).not.toBeNull()
    expect(stage.contains(comments)).toBe(false)
    expect(api.usePostComments).not.toHaveBeenCalled()
  })

  it('does not render the comment section for page-type posts', async () => {
    const html = await renderPost('page')

    expect(html).not.toContain('data-test="client-only"')
    expect(html).not.toContain('data-test="lazy-comment-section"')
    expect(html).not.toContain('class="comment-section"')
    expect(api.usePostComments).not.toHaveBeenCalled()
  })
  it('does not render the comment section when public settings disable comments', async () => {
    siteConfig.enabled = false
    const html = await renderPost('article')

    expect(html).not.toContain('data-test="client-only"')
    expect(html).not.toContain('data-test="lazy-comment-section"')
    expect(html).not.toContain('class="comment-section"')
    expect(api.usePostComments).not.toHaveBeenCalled()
  })
})
