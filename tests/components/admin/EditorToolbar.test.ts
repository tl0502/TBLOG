import { mount } from '@vue/test-utils'
import EditorToolbar from '../../../components/admin/EditorToolbar.vue'

describe('EditorToolbar', () => {
  it('emits markdown snippets for core formatting actions', async () => {
    const wrapper = mount(EditorToolbar)

    await wrapper.get('[data-test="toolbar-bold"]').trigger('click')
    await wrapper.get('[data-test="toolbar-italic"]').trigger('click')
    await wrapper.get('[data-test="toolbar-heading"]').trigger('click')
    await wrapper.get('[data-test="toolbar-link"]').trigger('click')
    await wrapper.get('[data-test="toolbar-code"]').trigger('click')
    await wrapper.get('[data-test="toolbar-list"]').trigger('click')

    expect(wrapper.emitted('insert')).toEqual([
      ['**text**'],
      ['*text*'],
      ['## Heading'],
      ['[label](https://example.com)'],
      ['`code`'],
      ['- item']
    ])
  })

  it('prompts for an external image and emits markdown image syntax', async () => {
    const prompt = vi.spyOn(window, 'prompt')
    prompt.mockReturnValueOnce('https://cdn.example.com/image.jpg')
    prompt.mockReturnValueOnce('Alt text')

    const wrapper = mount(EditorToolbar)
    await wrapper.get('[data-test="toolbar-image"]').trigger('click')

    expect(wrapper.emitted('insert')).toEqual([
      ['![Alt text](https://cdn.example.com/image.jpg)']
    ])
  })

  it('does not emit an image snippet when the URL prompt is cancelled', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce(null)

    const wrapper = mount(EditorToolbar)
    await wrapper.get('[data-test="toolbar-image"]').trigger('click')

    expect(wrapper.emitted('insert')).toBeUndefined()
  })

  it('requests a Markdown file import', async () => {
    const wrapper = mount(EditorToolbar)

    await wrapper.get('[data-test="toolbar-import"]').trigger('click')

    expect(wrapper.emitted('importFile')).toEqual([[]])
  })
})
