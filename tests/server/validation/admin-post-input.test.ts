import {
  createPostInputSchema,
  postIdParamSchema,
  previewInputSchema,
  updatePostInputSchema
} from '../../../server/validation/admin-post-input'

describe('admin post input validation', () => {
  describe('create', () => {
    it('accepts a minimal article and trims/parses fields', () => {
      expect(
        createPostInputSchema.parse({ type: 'article', title: '  Hello  ' })
      ).toEqual({ type: 'article', title: 'Hello' })
    })

    it('accepts full input incl. external cover URL, category, tags, markdown', () => {
      const parsed = createPostInputSchema.parse({
        type: 'page',
        title: 'About',
        slug: 'about',
        categoryId: 'cat1',
        cover: 'https://img.example.com/c.png',
        customExcerpt: 'A deliberate summary',
        seoTitle: 'SEO About',
        seoDescription: 'About description',
        canonicalUrlOverride: 'https://example.com/about',
        openGraphImageUrl: 'https://img.example.com/og.png',
        twitterImageUrl: 'https://img.example.com/twitter.png',
        jsonLdOverrideJson: '{"@type":"Article"}',
        tagIds: ['t1', 't2'],
        markdown: '# Hi'
      })
      expect(parsed.cover).toBe('https://img.example.com/c.png')
      expect(parsed.customExcerpt).toBe('A deliberate summary')
      expect(parsed.seoTitle).toBe('SEO About')
      expect(parsed.jsonLdOverrideJson).toBe('{"@type":"Article"}')
      expect(parsed.tagIds).toEqual(['t1', 't2'])
    })

    it('allows clearing cover/category with null', () => {
      const parsed = createPostInputSchema.parse({ type: 'article', title: 'X', cover: null, categoryId: null })
      expect(parsed.cover).toBeNull()
      expect(parsed.categoryId).toBeNull()
    })

    it('rejects an unknown type', () => {
      expect(() => createPostInputSchema.parse({ type: 'note', title: 'X' })).toThrow()
    })

    it('rejects an empty title', () => {
      expect(() => createPostInputSchema.parse({ type: 'article', title: '   ' })).toThrow()
    })

    it('rejects a non-URL cover', () => {
      expect(() => createPostInputSchema.parse({ type: 'article', title: 'X', cover: 'not-a-url' })).toThrow()
    })
  })

  describe('update', () => {
    it('accepts a partial field update', () => {
      expect(updatePostInputSchema.parse({ title: 'New' })).toEqual({ title: 'New' })
    })

    it('accepts a status-only change', () => {
      expect(updatePostInputSchema.parse({ status: 'published' })).toEqual({ status: 'published' })
    })

    it('accepts a featured-only change', () => {
      expect(updatePostInputSchema.parse({ featured: true })).toEqual({ featured: true })
    })

    it('accepts clearing a custom excerpt and rejects values over 500 characters', () => {
      expect(updatePostInputSchema.parse({ customExcerpt: null })).toEqual({ customExcerpt: null })
      expect(() => updatePostInputSchema.parse({ customExcerpt: 'x'.repeat(501) })).toThrow()
    })

    it('normalizes blank SEO fields and validates URLs and JSON-LD objects', () => {
      expect(updatePostInputSchema.parse({
        seoTitle: ' ',
        seoDescription: '',
        canonicalUrlOverride: 'https://canonical.example/post',
        openGraphImageUrl: 'https://img.example/og.png',
        twitterImageUrl: 'https://img.example/twitter.png',
        jsonLdOverrideJson: '{"@type":"Article"}'
      })).toMatchObject({ seoTitle: null, seoDescription: null })

      expect(() => updatePostInputSchema.parse({ canonicalUrlOverride: '/relative' })).toThrow()
      expect(() => updatePostInputSchema.parse({ openGraphImageUrl: 'javascript:alert(1)' })).toThrow()
      expect(() => updatePostInputSchema.parse({ jsonLdOverrideJson: '[]' })).toThrow()
      expect(() => updatePostInputSchema.parse({ jsonLdOverrideJson: '{broken' })).toThrow()
    })

    it('rejects an empty update (no fields)', () => {
      expect(() => updatePostInputSchema.parse({})).toThrow()
    })

    it('rejects an unknown status', () => {
      expect(() => updatePostInputSchema.parse({ status: 'archived' })).toThrow()
    })
  })

  describe('preview', () => {
    it('accepts markdown (incl. empty string)', () => {
      expect(previewInputSchema.parse({ markdown: '' })).toEqual({ markdown: '' })
    })

    it('rejects a missing markdown field', () => {
      expect(() => previewInputSchema.parse({})).toThrow()
    })
  })

  describe('id param', () => {
    it('accepts a non-empty id and rejects blank', () => {
      expect(postIdParamSchema.parse('p1')).toBe('p1')
      expect(() => postIdParamSchema.parse('   ')).toThrow()
    })
  })
})
