import {
  enhanceCodeBlocks,
  enhanceCodeBlocksNearViewport
} from '../../../composables/useCodeBlockEnhancements'
import type { CodeBlockMetaView } from '../../../types/public-view'

// Two hljs-style blocks. Block 1's comment span deliberately straddles a newline to prove
// multi-line token splitting preserves the highlight class on both resulting lines.
const SAMPLE = `
  <pre><code class="hljs language-ts"><span class="hljs-keyword">const</span> a = 1
<span class="hljs-comment">// note
still comment</span>
done</code></pre>
  <pre><code class="hljs language-js">a
b</code></pre>
`

function makeRoot(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = SAMPLE
  return root
}

const fullMeta: CodeBlockMetaView[] = [
  { index: 0, language: 'ts', filename: 'app.ts', highlightedLines: [2], collapsed: true, diff: true },
  { index: 1, language: 'js', filename: null, highlightedLines: [], collapsed: false, diff: false }
]

describe('enhanceCodeBlocks', () => {
  it('applies copy, line numbers, filename, highlight, collapse, and diff from codeMeta', () => {
    const root = makeRoot()

    enhanceCodeBlocks(root, fullMeta)

    const blocks = root.querySelectorAll('.code-block')
    expect(blocks).toHaveLength(2)

    const first = blocks[0]
    // Line numbering: one `.code-line` per source line (4: code, two-line comment, done).
    const lines = first.querySelectorAll('.code-line')
    expect(lines).toHaveLength(4)
    expect(first.querySelector('.code-block__copy')).not.toBeNull()
    expect(first.querySelector('.code-block__filename')?.textContent).toBe('app.ts')
    expect(first.querySelector('.code-block__lang')?.textContent).toBe('ts')
    expect(first.classList.contains('code-block--diff')).toBe(true)
    expect(first.classList.contains('code-block--collapsed')).toBe(true)

    // Highlighted line 2 is the first comment line; the comment class survives the split.
    const highlighted = first.querySelectorAll('.code-line--highlight')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0].textContent).toContain('// note')
    expect(lines[2].querySelector('.hljs-comment')?.textContent).toBe('still comment')
  })

  it('keeps only baseline enhancements when codeMeta is empty', () => {
    const root = makeRoot()

    enhanceCodeBlocks(root, [])

    const first = root.querySelector('.code-block')
    expect(first).not.toBeNull()
    expect(first?.querySelector('.code-block__copy')).not.toBeNull()
    expect(first?.querySelectorAll('.code-line').length).toBeGreaterThan(0)
    // No codeMeta-driven enhancements.
    expect(first?.querySelector('.code-block__filename')).toBeNull()
    expect(first?.classList.contains('code-block--diff')).toBe(false)
    expect(first?.querySelector('.code-line--highlight')).toBeNull()
  })

  it('enhances matched blocks by document order on a count mismatch', () => {
    const root = makeRoot()

    // Only the first block has metadata; the second must still get baseline enhancement.
    enhanceCodeBlocks(root, [fullMeta[0]])

    const blocks = root.querySelectorAll('.code-block')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].querySelector('.code-block__filename')?.textContent).toBe('app.ts')
    expect(blocks[1].querySelector('.code-block__filename')).toBeNull()
    expect(blocks[1].querySelectorAll('.code-line').length).toBe(2)
  })

  it('copies enhanced multi-line code with source newlines intact', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const root = makeRoot()

    enhanceCodeBlocks(root, fullMeta)
    ;(root.querySelector('.code-block__copy') as HTMLButtonElement).click()

    expect(writeText).toHaveBeenCalledWith('const a = 1\n// note\nstill comment\ndone')
  })

  it('defers rebuilding blocks until they approach the viewport', () => {
    const observers: Array<{
      callback: IntersectionObserverCallback
      observed: Element[]
      disconnected: boolean
    }> = []

    class FakeIntersectionObserver {
      callback: IntersectionObserverCallback
      observed: Element[] = []
      disconnected = false

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
        observers.push(this)
      }

      observe(target: Element) {
        this.observed.push(target)
      }

      unobserve(target: Element) {
        this.observed = this.observed.filter((item) => item !== target)
      }

      disconnect() {
        this.disconnected = true
      }

      takeRecords(): IntersectionObserverEntry[] {
        return []
      }

      readonly root = null
      readonly rootMargin = '400px 0px'
      readonly thresholds = [0]
    }

    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    const root = makeRoot()
    const pre = Array.from(root.querySelectorAll('pre'))

    const stop = enhanceCodeBlocksNearViewport(root, fullMeta)

    expect(root.querySelector('.code-block')).toBeNull()
    expect(observers[0]?.observed).toEqual(pre)

    observers[0]?.callback([
      { isIntersecting: true, target: pre[0] } as unknown as IntersectionObserverEntry
    ], observers[0] as unknown as IntersectionObserver)

    expect(root.querySelectorAll('.code-block')).toHaveLength(1)
    expect(pre[1].dataset.enhanced).not.toBe('true')

    stop()
    expect(observers[0]?.disconnected).toBe(true)

    const stopRemaining = enhanceCodeBlocksNearViewport(root, fullMeta)
    observers[1]?.callback([
      { isIntersecting: true, target: pre[1] } as unknown as IntersectionObserverEntry
    ], observers[1] as unknown as IntersectionObserver)

    const completed = root.querySelectorAll('.code-block')
    expect(completed).toHaveLength(2)
    expect(completed[1].querySelector('.code-block__filename')).toBeNull()
    stopRemaining()
    vi.unstubAllGlobals()
  })
})
