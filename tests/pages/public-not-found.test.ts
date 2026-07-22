import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  useCategoryDetail: vi.fn(),
  useTagDetail: vi.fn(),
  usePostDetail: vi.fn()
}))

vi.mock('~/composables/usePublicApi', () => api)

vi.stubGlobal('useRoute', () => ({ params: { slug: 'missing' } }))
vi.stubGlobal('definePageMeta', vi.fn())
vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string; fatal: boolean }) => (
  Object.assign(new Error(input.statusMessage), input)
))

function missingResult(statusCode = 404) {
  return {
    data: ref(null),
    error: ref(Object.assign(new Error('not found'), { statusCode }))
  }
}

async function renderPage(component: object) {
  const errors: unknown[] = []
  const app = createSSRApp(component)
  app.config.warnHandler = () => {}
  app.config.errorHandler = (error) => {
    errors.push(error)
  }
  await renderToString(app)
  return errors
}

beforeEach(() => {
  vi.clearAllMocks()
  api.useCategoryDetail.mockReturnValue(missingResult())
  api.useTagDetail.mockReturnValue(missingResult())
  api.usePostDetail.mockReturnValue(missingResult())
})

describe('public not-found pages', () => {
  it('throws a 404 for a missing category during setup', async () => {
    const page = await import('../../pages/categories/[slug].vue')

    await expect(renderPage(page.default)).resolves.toEqual([
      expect.objectContaining({
        statusCode: 404,
        statusMessage: 'Category not found',
        fatal: true
      })
    ])
  })

  it('throws a 404 for a missing tag during setup', async () => {
    const page = await import('../../pages/tags/[slug].vue')

    await expect(renderPage(page.default)).resolves.toEqual([
      expect.objectContaining({
        statusCode: 404,
        statusMessage: 'Tag not found',
        fatal: true
      })
    ])
  })

  it('throws a 404 for a missing About page during setup', async () => {
    const page = await import('../../pages/about.vue')

    await expect(renderPage(page.default)).resolves.toEqual([
      expect.objectContaining({
        statusCode: 404,
        statusMessage: 'About page not found',
        fatal: true
      })
    ])
  })

  it('maps an authoritative gone About page to the public 404 surface', async () => {
    api.usePostDetail.mockReturnValue(missingResult(410))
    const page = await import('../../pages/about.vue')

    await expect(renderPage(page.default)).resolves.toEqual([
      expect.objectContaining({ statusCode: 404, statusMessage: 'About page not found' })
    ])
  })

})
