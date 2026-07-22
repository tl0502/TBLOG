import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import type { CodeBlockMetaView } from '~/types/public-view'

interface FlatToken {
  text: string
  // Ancestor `<span>` class chain (outermost first) so highlighting is preserved on rebuild.
  classes: string[]
}

function flattenTokens(node: Node, classes: string[], out: FlatToken[]) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3 /* text */) {
      out.push({ text: child.textContent ?? '', classes })
    } else if (child.nodeType === 1 /* element */) {
      const el = child as HTMLElement
      const cls = el.getAttribute('class')
      flattenTokens(el, cls ? [...classes, cls] : classes, out)
    }
  })
}

function buildToken(token: FlatToken, doc: Document): Node {
  let node: Node = doc.createTextNode(token.text)
  for (let i = token.classes.length - 1; i >= 0; i -= 1) {
    const span = doc.createElement('span')
    span.setAttribute('class', token.classes[i])
    span.appendChild(node)
    node = span
  }
  return node
}

// Rewrap highlight.js token output into one `.code-line` per source line, splitting tokens
// (including multi-line spans) at every newline while preserving their class chain. CSS counters
// on `.code-line` render the gutter numbers.
function splitIntoLines(code: HTMLElement): HTMLElement[] {
  const doc = code.ownerDocument
  const tokens: FlatToken[] = []
  flattenTokens(code, [], tokens)

  const lines: HTMLElement[] = []
  let line = doc.createElement('span')
  line.className = 'code-line'

  const pushLine = () => {
    lines.push(line)
    line = doc.createElement('span')
    line.className = 'code-line'
  }

  for (const token of tokens) {
    const parts = token.text.split('\n')
    parts.forEach((part, index) => {
      if (index > 0) {
        pushLine()
      }
      if (part.length) {
        line.appendChild(buildToken({ text: part, classes: token.classes }, doc))
      }
    })
  }
  lines.push(line)

  // Drop the trailing empty line produced by a final newline.
  if (lines.length > 1 && !lines[lines.length - 1].textContent) {
    lines.pop()
  }

  while (code.firstChild) {
    code.removeChild(code.firstChild)
  }
  for (const lineEl of lines) {
    code.appendChild(lineEl)
  }
  return lines
}

function languageFromClass(code: HTMLElement): string | null {
  const match = (code.getAttribute('class') ?? '').match(/language-([\w+-]+)/)
  return match ? match[1] : null
}

function restoreCodeLines(code: HTMLElement) {
  const lines = Array.from(code.children).filter((child) =>
    child.classList.contains('code-line')
  ) as HTMLElement[]

  if (!lines.length || lines.length !== code.children.length) {
    return
  }

  const fragment = code.ownerDocument.createDocumentFragment()
  lines.forEach((line, index) => {
    if (index > 0) {
      fragment.appendChild(code.ownerDocument.createTextNode('\n'))
    }
    while (line.firstChild) {
      fragment.appendChild(line.firstChild)
    }
  })
  code.replaceChildren(fragment)
}

function resetEnhancedBlocks(root: HTMLElement) {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('pre[data-enhanced="true"]'))
  for (const pre of blocks) {
    const code = pre.querySelector<HTMLElement>('code')
    if (code) {
      restoreCodeLines(code)
    }

    pre.classList.remove('code-block__pre')
    delete pre.dataset.enhanced

    const wrapper = pre.parentElement
    if (wrapper?.classList.contains('code-block')) {
      wrapper.parentNode?.insertBefore(pre, wrapper)
      wrapper.remove()
    }
  }
}

function enhanceBlock(pre: HTMLElement, meta: CodeBlockMetaView | undefined) {
  if (pre.dataset.enhanced === 'true') {
    return
  }
  const code = pre.querySelector('code')
  if (!code) {
    return
  }
  const doc = pre.ownerDocument
  pre.dataset.enhanced = 'true'

  const language = languageFromClass(code) ?? meta?.language ?? null
  const lineEls = splitIntoLines(code)

  // codeMeta-driven highlighted lines (1-based).
  if (meta?.highlightedLines?.length) {
    for (const lineNumber of meta.highlightedLines) {
      lineEls[lineNumber - 1]?.classList.add('code-line--highlight')
    }
  }

  const wrapper = doc.createElement('div')
  wrapper.className = 'code-block'
  wrapper.dataset.lineCount = String(lineEls.length)
  if (meta?.diff || language === 'diff') {
    wrapper.classList.add('code-block--diff')
  }
  if (meta?.collapsed) {
    wrapper.classList.add('code-block--collapsed')
  }

  const header = doc.createElement('div')
  header.className = 'code-block__header'

  if (meta?.filename) {
    const filename = doc.createElement('span')
    filename.className = 'code-block__filename'
    filename.textContent = meta.filename
    header.appendChild(filename)
  }

  if (language) {
    const label = doc.createElement('span')
    label.className = 'code-block__lang'
    label.textContent = language
    header.appendChild(label)
  }

  // Collapse toggle only for blocks the author marked collapsible.
  if (meta?.collapsed) {
    const toggle = doc.createElement('button')
    toggle.type = 'button'
    toggle.className = 'code-block__toggle'
    toggle.textContent = '展开'
    toggle.addEventListener('click', () => {
      const collapsed = wrapper.classList.toggle('code-block--collapsed')
      toggle.textContent = collapsed ? '展开' : '收起'
    })
    header.appendChild(toggle)
  }

  const copy = doc.createElement('button')
  copy.type = 'button'
  copy.className = 'code-block__copy'
  copy.textContent = 'Copy'
  copy.addEventListener('click', () => {
    const lines = Array.from(code.children).filter((child) =>
      child.classList.contains('code-line')
    )
    const text = lines.length === code.children.length
      ? lines.map((line) => line.textContent ?? '').join('\n')
      : code.textContent ?? ''
    void navigator.clipboard?.writeText(text)
  })
  header.appendChild(copy)

  pre.classList.add('code-block__pre')

  pre.replaceWith(wrapper)
  wrapper.appendChild(header)
  wrapper.appendChild(pre)
}

/**
 * Enhance server-rendered `<pre><code>` blocks in document order against `codeMeta`. Baseline
 * enhancements (line wrapping for numbering, language label, copy) apply to every block; `codeMeta`
 * adds filename, highlighted lines, collapse, and diff styling. Degrades gracefully: blocks with no
 * matching `codeMeta` entry keep only the baseline; extra `codeMeta` entries are ignored.
 */
export function enhanceCodeBlocks(root: HTMLElement, codeMeta: CodeBlockMetaView[]) {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('pre'))
  blocks.forEach((pre, index) => enhanceBlock(pre, codeMeta[index]))
}

/**
 * Observe unenhanced code blocks and only rebuild their line DOM when they approach the viewport.
 * Browsers without IntersectionObserver keep the existing eager behavior as a compatibility fallback.
 */
export function enhanceCodeBlocksNearViewport(
  root: HTMLElement,
  codeMeta: CodeBlockMetaView[]
): () => void {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('pre'))
    .map((pre, index) => ({ pre, meta: codeMeta[index] }))
    .filter(({ pre }) => pre.dataset.enhanced !== 'true')

  if (!blocks.length) return () => undefined
  if (typeof IntersectionObserver === 'undefined') {
    blocks.forEach(({ pre, meta }) => enhanceBlock(pre, meta))
    return () => undefined
  }

  const metadata = new Map(blocks.map(({ pre, meta }) => [pre, meta]))
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const pre = entry.target as HTMLElement
      observer.unobserve(pre)
      enhanceBlock(pre, metadata.get(pre))
      metadata.delete(pre)
    }
    if (metadata.size === 0) {
      observer.disconnect()
    }
  }, { rootMargin: '400px 0px' })

  blocks.forEach(({ pre }) => observer.observe(pre))
  return () => observer.disconnect()
}

export function useCodeBlockEnhancements(
  root: Ref<HTMLElement | null>,
  html: Ref<string>,
  codeMeta: Ref<CodeBlockMetaView[]>
) {
  let stopObserving: (() => void) | null = null

  function run() {
    stopObserving?.()
    if (root.value) {
      resetEnhancedBlocks(root.value)
      stopObserving = enhanceCodeBlocksNearViewport(root.value, codeMeta.value)
    }
  }

  onMounted(run)
  // `flush: 'post'` so the watch runs after the v-html DOM patch, not before it.
  watch([html, codeMeta], run, { flush: 'post' })
  onBeforeUnmount(() => {
    stopObserving?.()
    stopObserving = null
  })
}
