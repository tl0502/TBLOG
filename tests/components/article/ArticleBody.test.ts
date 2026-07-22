import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { mount } from '@vue/test-utils'
import ArticleBody from '../../../components/article/ArticleBody.vue'
import type { CodeBlockMetaView } from '../../../types/public-view'

const html = `
  <h2 id="intro">Intro</h2>
  <p>Body text.</p>
  <img src="https://images.example/body.jpg" alt="Body image">
  <pre><code class="hljs language-ts">const a = 1
const b = 2</code></pre>
`

const codeMeta: CodeBlockMetaView[] = [
  { index: 0, language: 'ts', filename: 'app.ts', highlightedLines: [], collapsed: false, diff: false }
]

describe('ArticleBody', () => {
  it('renders the sanitized html and enhances code blocks after mount', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const wrapper = mount(ArticleBody, { props: { html, codeMeta } })

    expect(wrapper.text()).toContain('Body text.')
    // Enhancer wiring fired on mount: the <pre> is wrapped and numbered.
    expect(wrapper.find('.code-block').exists()).toBe(true)
    expect(wrapper.find('.code-block__filename').text()).toBe('app.ts')
    expect(wrapper.findAll('.code-line')).toHaveLength(2)
    vi.unstubAllGlobals()
  })

  it('emits body image loading hints in SSR html before hydration', async () => {
    const app = createSSRApp(ArticleBody, { html, codeMeta: [] })

    const rendered = await renderToString(app)

    expect(rendered).toContain('loading="lazy"')
    expect(rendered).toContain('decoding="async"')
    expect(rendered).toContain('src="https://images.example/body.jpg"')
  })
})
