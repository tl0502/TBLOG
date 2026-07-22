import { mount } from '@vue/test-utils'
import PostMetadataPanel, {
  type PostMetadataModel,
  type TaxonomyOption
} from '../../../components/admin/PostMetadataPanel.vue'

const categories: TaxonomyOption[] = [
  { id: 'cat-1', name: 'Engineering' },
  { id: 'cat-2', name: 'Notes' }
]

const tags: TaxonomyOption[] = [
  { id: 'tag-1', name: 'Nuxt' },
  { id: 'tag-2', name: 'Cloudflare' }
]

const articleModel: PostMetadataModel = {
  type: 'article',
  slug: 'hello-world',
  cover: 'https://cdn.example.com/cover.jpg',
  categoryId: 'cat-1',
  tagIds: ['tag-1'],
  status: 'draft',
  featured: false,
  seoTitle: null,
  seoDescription: null,
  canonicalUrlOverride: null,
  openGraphImageUrl: null,
  twitterImageUrl: null,
  jsonLdOverrideJson: null
}

function mountPanel(model: PostMetadataModel = articleModel) {
  return mount(PostMetadataPanel, {
    props: { modelValue: model, categories, tags }
  })
}

describe('PostMetadataPanel', () => {
  it('renders article metadata fields and emits a full updated model', async () => {
    const wrapper = mountPanel()

    await wrapper.get('[data-test="metadata-slug"]').setValue('updated-slug')
    await wrapper.get('[data-test="metadata-cover"]').setValue('https://cdn.example.com/new.jpg')
    await wrapper.get('[data-test="metadata-category"]').setValue('cat-2')
    await wrapper.get('[data-test="metadata-tag-tag-2"]').setValue(true)
    await wrapper.get('[data-test="metadata-status"]').setValue('published')

    const updates = wrapper.emitted('update:modelValue') as [PostMetadataModel][]
    expect(updates.at(-1)?.[0]).toEqual({
      ...articleModel,
      status: 'published'
    })
    expect(updates.map(([value]) => value.slug)).toContain('updated-slug')
    expect(updates.map(([value]) => value.cover)).toContain('https://cdn.example.com/new.jpg')
    expect(updates.map(([value]) => value.categoryId)).toContain('cat-2')
    expect(updates.map(([value]) => value.tagIds)).toContainEqual(['tag-1', 'tag-2'])
  })

  it('hides article-only fields for the About page', () => {
    const wrapper = mountPanel({
      type: 'page',
      slug: 'about',
      cover: null,
      categoryId: null,
      tagIds: [],
      status: 'draft',
      featured: false,
      seoTitle: null,
      seoDescription: null,
      canonicalUrlOverride: null,
      openGraphImageUrl: null,
      twitterImageUrl: null,
      jsonLdOverrideJson: null
    })

    expect(wrapper.get('[data-test="metadata-slug"]').element).toBeTruthy()
    expect(wrapper.find('[data-test="metadata-cover"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="metadata-category"]').exists()).toBe(false)
    expect(wrapper.find('[data-test^="metadata-tag-"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="metadata-seo-panel"]').exists()).toBe(false)
  })

  it('enables homepage featuring only for published articles', async () => {
    const draft = mountPanel()
    expect(draft.get('[data-test="metadata-featured"]').attributes('disabled')).toBeDefined()

    const published = mountPanel({ ...articleModel, status: 'published' })
    await published.get('[data-test="metadata-featured"]').setValue(true)

    expect(published.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ featured: true })
  })

  it('edits article SEO fields and emits null when an optional value is cleared', async () => {
    const wrapper = mountPanel({ ...articleModel, seoTitle: 'Old title' })

    await wrapper.get('[data-test="metadata-seo-title"]').setValue('New title')
    await wrapper.get('[data-test="metadata-canonical-override"]').setValue('https://example.com/posts/hello')
    await wrapper.get('[data-test="metadata-json-ld"]').setValue('{"@type":"Article"}')
    await wrapper.get('[data-test="metadata-seo-title"]').setValue('')

    const updates = wrapper.emitted('update:modelValue') as [PostMetadataModel][]
    expect(updates.map(([value]) => value.canonicalUrlOverride)).toContain('https://example.com/posts/hello')
    expect(updates.map(([value]) => value.jsonLdOverrideJson)).toContain('{"@type":"Article"}')
    expect(updates.at(-1)?.[0].seoTitle).toBeNull()
  })
})
