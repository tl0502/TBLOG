import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PostEditor, {
  type PostEditorInitialPost,
  type PostEditorSavePayload
} from '../../../components/admin/PostEditor.vue'

const initialPost: PostEditorInitialPost = {
  title: 'Draft title',
  type: 'article',
  status: 'draft',
  featured: false,
  slug: 'draft-title',
  cover: null,
  customExcerpt: null,
  categoryId: null,
  tagIds: [],
  markdown: 'Hello',
  seoTitle: null,
  seoDescription: null,
  canonicalUrlOverride: null,
  openGraphImageUrl: null,
  twitterImageUrl: null,
  jsonLdOverrideJson: null
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function mountEditor(overrides: Partial<PostEditorInitialPost> = {}) {
  const previewMarkdown = vi.fn(async (markdown: string) => ({ html: `<p>${markdown}</p>` }))
  const wrapper = mount(PostEditor, {
    props: {
      initialPost: { ...initialPost, ...overrides },
      categories: [],
      tags: [],
      previewMarkdown,
      previewDelay: 0
    }
  })
  return { wrapper, previewMarkdown }
}

describe('PostEditor', () => {
  it('shows the document type and current lifecycle status in the editor header', () => {
    const { wrapper } = mountEditor({ status: 'published' })

    expect(wrapper.get('.post-editor__document-type').text()).toBe('ARTICLE')
    expect(wrapper.get('.post-editor__status').text()).toContain('已发布')
    expect(wrapper.get('.post-editor__status').classes()).toContain('is-published')
  })

  it('exposes the preview toggle state to assistive technology', async () => {
    const { wrapper } = mountEditor()
    const toggle = wrapper.findAll('button').find((button) => button.text() === '预览')

    expect(toggle?.attributes('aria-pressed')).toBe('true')
    await toggle?.trigger('click')
    expect(toggle?.attributes('aria-pressed')).toBe('false')
  })

  it('places metadata above the writing workspace', () => {
    const { wrapper } = mountEditor()
    const bodyChildren = wrapper.get('.post-editor__body').element.children

    expect(bodyChildren[0]?.classList.contains('post-metadata')).toBe(true)
    expect(bodyChildren[1]?.classList.contains('post-editor__workspace')).toBe(true)
  })

  it('resizes the writing and preview panes with the keyboard', async () => {
    const { wrapper } = mountEditor()
    const resizer = wrapper.get('[data-test="post-editor-resizer"]')

    expect(resizer.attributes('aria-valuenow')).toBe('56')
    await resizer.trigger('keydown', { key: 'ArrowRight' })
    expect(resizer.attributes('aria-valuenow')).toBe('58')
    await resizer.trigger('keydown', { key: 'Home' })
    expect(resizer.attributes('aria-valuenow')).toBe('30')
  })

  it('inserts toolbar snippets at the textarea caret', async () => {
    const { wrapper } = mountEditor()
    const textarea = wrapper.get<HTMLTextAreaElement>('[data-test="post-editor-markdown"]')

    await textarea.setValue('Hello ')
    textarea.element.setSelectionRange(6, 6)
    await wrapper.get('[data-test="toolbar-bold"]').trigger('click')

    expect(textarea.element.value).toBe('Hello **text**')
  })

  it('emits a composed save payload', async () => {
    const { wrapper } = mountEditor()

    await wrapper.get('[data-test="post-editor-title"]').setValue('Updated title')
    await wrapper.get('[data-test="metadata-slug"]').setValue('updated-title')
    await wrapper.get('[data-test="post-editor-markdown"]').setValue('Updated markdown')
    await wrapper.get('[data-test="post-editor-save"]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [{
        title: 'Updated title',
        type: 'article',
        slug: 'updated-title',
        cover: null,
        customExcerpt: null,
        categoryId: null,
        tagIds: [],
        markdown: 'Updated markdown',
        status: 'draft',
        featured: false,
        seoTitle: null,
        seoDescription: null,
        canonicalUrlOverride: null,
        openGraphImageUrl: null,
        twitterImageUrl: null,
        jsonLdOverrideJson: null
      } satisfies PostEditorSavePayload]
    ])
  })

  it('updates local status after a status action', async () => {
    const { wrapper } = mountEditor()
    const statusButton = wrapper.findAll('button').find((button) => button.text() === '发布')

    await statusButton?.trigger('click')

    expect(wrapper.text()).toContain('取消发布')
    expect(wrapper.emitted('statusChange')).toEqual([
      [
        'published',
        {
          ...initialPost,
          status: 'published',
          tagIds: []
        } satisfies PostEditorSavePayload
      ]
    ])

    await wrapper.get('[data-test="post-editor-save"]').trigger('click')
    expect(wrapper.emitted('save')?.at(-1)?.[0]).toMatchObject({ status: 'published' })
  })

  it('uses the injected preview callback and renders returned sanitized HTML', async () => {
    const { wrapper, previewMarkdown } = mountEditor()

    await new Promise((resolve) => window.setTimeout(resolve, 0))

    expect(previewMarkdown).toHaveBeenCalledWith('Hello')
    expect(wrapper.find('.post-editor__preview-body').html()).toContain('<p>Hello</p>')
  })

  it('restarts the same Markdown preview when an in-flight request was invalidated while hidden', async () => {
    vi.useFakeTimers()
    const firstPreview = deferred<{ html: string }>()
    const secondPreview = deferred<{ html: string }>()
    const previewMarkdown = vi.fn()
      .mockReturnValueOnce(firstPreview.promise)
      .mockReturnValueOnce(secondPreview.promise)
    const wrapper = mount(PostEditor, {
      props: {
        initialPost,
        categories: [],
        tags: [],
        previewMarkdown,
        previewDelay: 0
      }
    })

    try {
      vi.runOnlyPendingTimers()
      await nextTick()
      expect(previewMarkdown).toHaveBeenCalledTimes(1)

      const toggle = wrapper.findAll('button').find((button) => button.text() === '预览')
      await toggle?.trigger('click')
      await toggle?.trigger('click')
      vi.runOnlyPendingTimers()
      await nextTick()

      expect(previewMarkdown).toHaveBeenCalledTimes(1)

      firstPreview.resolve({ html: '<p>stale</p>' })
      await flushPromises()

      expect(previewMarkdown).toHaveBeenCalledTimes(2)
      expect(previewMarkdown).toHaveBeenNthCalledWith(2, 'Hello')
      expect(wrapper.find('.post-editor__preview-body').exists()).toBe(false)

      secondPreview.resolve({ html: '<p>fresh</p>' })
      await flushPromises()

      expect(wrapper.find('.post-editor__preview-body').html()).toContain('<p>fresh</p>')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('auto-fills the slug from the title for a new post until the slug is edited', async () => {
    const { wrapper } = mountEditor({ title: '', slug: '', markdown: '' })
    const slug = wrapper.get<HTMLInputElement>('[data-test="metadata-slug"]')

    await wrapper.get('[data-test="post-editor-title"]').setValue('My First Post')
    await nextTick()
    expect(slug.element.value).toBe('my-first-post')

    // A manual slug edit pins it, so later title changes no longer touch it.
    await slug.setValue('custom-slug')
    await wrapper.get('[data-test="post-editor-title"]').setValue('A Different Title')
    await nextTick()
    expect(slug.element.value).toBe('custom-slug')
  })

  it('leaves the slug empty for a non-Latin title so the author sets one', async () => {
    const { wrapper } = mountEditor({ title: '', slug: '', markdown: '' })

    await wrapper.get('[data-test="post-editor-title"]').setValue('关于我')
    await nextTick()

    expect(wrapper.get<HTMLInputElement>('[data-test="metadata-slug"]').element.value).toBe('')
  })

  it('does not overwrite the slug of an existing post when the title changes', async () => {
    const { wrapper } = mountEditor({ title: 'Existing', slug: 'existing-slug' })

    await wrapper.get('[data-test="post-editor-title"]').setValue('Renamed')
    await nextTick()

    expect(wrapper.get<HTMLInputElement>('[data-test="metadata-slug"]').element.value).toBe('existing-slug')
  })

  it('includes the custom excerpt in the save payload', async () => {
    const { wrapper } = mountEditor()

    await wrapper.get('[data-test="post-editor-custom-excerpt"]').setValue('A deliberate summary')
    await wrapper.get('[data-test="post-editor-save"]').trigger('click')

    expect(wrapper.emitted('save')?.at(-1)?.[0]).toMatchObject({
      customExcerpt: 'A deliberate summary'
    })
  })

  it('clears the featured selection when unpublishing', async () => {
    const { wrapper } = mountEditor({ status: 'published', featured: true })
    const statusButton = wrapper.findAll('button').find((button) => button.text() === '取消发布')

    await statusButton?.trigger('click')

    expect(wrapper.emitted('statusChange')?.at(-1)?.[1]).toMatchObject({
      status: 'draft',
      featured: false
    })
  })

  it('imports a Markdown file after confirming replacement', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { wrapper } = mountEditor()
    const input = wrapper.get<HTMLInputElement>('[data-test="post-editor-file-input"]')
    const file = new File(['# Imported\n\nBody'], 'draft.md', { type: 'text/markdown' })
    Object.defineProperty(file, 'text', { value: vi.fn(async () => '# Imported\n\nBody') })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })

    await input.trigger('change')
    await nextTick()

    expect(window.confirm).toHaveBeenCalledOnce()
    expect(wrapper.get<HTMLTextAreaElement>('[data-test="post-editor-markdown"]').element.value)
      .toBe('# Imported\n\nBody')
  })

  it('keeps existing Markdown when file replacement is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper } = mountEditor()
    const input = wrapper.get<HTMLInputElement>('[data-test="post-editor-file-input"]')
    const file = new File(['Replacement'], 'draft.markdown', { type: 'text/markdown' })
    Object.defineProperty(file, 'text', { value: vi.fn(async () => 'Replacement') })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })

    await input.trigger('change')

    expect(wrapper.get<HTMLTextAreaElement>('[data-test="post-editor-markdown"]').element.value).toBe('Hello')
  })
})
